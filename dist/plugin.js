exports.version = 0.1
exports.apiRequired = 3 // defaultValue
exports.repo = "rejetto/download-quota"
exports.description = "Download quota, per-account"

exports.config = {
    hours: { type: 'number', min: 0.1, step: 0.1, defaultValue: 24 },
    megabytes: { type: 'number', min: 1, defaultValue: 1000, helpertext: "This quota is applied per-account. Anonymous users are not restricted." },
}


exports.init = async api => {
    const { debounceAsync, formatBytes, formatTimestamp } = api.require('./misc')
    const { getCurrentUsername } = api.require('./auth')
    const { join } = api.require('path')
    const { writeFile, readFile } = api.require('fs/promises')
    const perAccountFile = join(api.storageDir, 'per-account.json')
    let perAccount = {}

    // load previous stats
    try {
        perAccount = JSON.parse(await readFile(perAccountFile, 'utf8'))
    }
    catch(err) {
        if (err.code !== 'ENOENT')
            api.log(err)
    }

    const save = debounceAsync(() => writeFile(perAccountFile, JSON.stringify(perAccount)),
        2_000, { maxWait: 30_000 })

    return {
        unload: () => save.flush(), // we may have pending savings
        middleware: ctx => () => { // callback = execute after other middlewares are done
            const u = getCurrentUsername(ctx)
            if (!u) return // only with accounts
            if (ctx.status >= 300 || ctx.state.download_counter_ignore || ctx.state.considerAsGui) return
            if (!(ctx.vfsNode || ctx.state.archive)) return // not a download
            const expiration = api.getConfig('hours') * 3600_000
            const quota = api.getConfig('megabytes') * 1024 * 1024
            const size = ctx.state.length ?? ctx.length
            const now = Date.now()
            const brandNewAccount = { b: 0, started: now }
            const account = (perAccount[u] ||= brandNewAccount)
            const expires = account.started + expiration
            if (expires <= now)
                Object.assign(account, brandNewAccount)
            const wouldBe = account.b + size
            if (wouldBe > quota) {
                ctx.status = 429
                ctx.type = 'text'
                ctx.set('content-disposition', '')
                ctx.body = `You have reached your ${formatBytes(quota)} quota, that will reset on ${formatTimestamp(expires)}`
                return
            }
            account.b = wouldBe
            save()
        }
    }
}
