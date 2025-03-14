exports.version = 2.21
exports.apiRequired = 10.2 // api.i18n
exports.repo = "rejetto/download-quota"
exports.description = "Download quota, per-account"
exports.frontend_js = 'main.js'
exports.changelog = [
    { "version": 2.21, "message": "Finnish translation" },
    { "version": 2.2, "message": "Now the error message can be translated" },
    { "version": 2.15, "message": "Compatibility with new HFS version" },
    { "version": 2.14, "message": "Error fixed" },
    { "version": 2.1, "message": "Compatibility with new HFS version" },
    { "version": 2, "message": "Decide quota on specific accounts" }
]

exports.config = {
    hours: { type: 'number', min: 0.1, step: 0.1, defaultValue: 24, sm: 6, },
    megabytes: { type: 'number', min: 1, defaultValue: 1000, sm: 6, helperText: "Default quota applied per-account. Anonymous users are not restricted." },
    perAccount: { type: 'array', fields: { username: { type: 'username' }, megabytes: { type: 'number', min: 1, defaultValue: 1000 } },
        label: "Decide quota on specific accounts"
    },
}
exports.configDialog = {
    sx: { maxWidth: '30em' },
}

const PREFIX = 'dlQuota_'

exports.init = async api => {
    const { debounceAsync, formatBytes, formatTimestamp } = api.require('./misc')
    const { getCurrentUsername } = api.require('./auth')
    const { join } = api.require('path')
    const { writeFile, readFile } = api.require('fs/promises')
    const _ = api.require('lodash')
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
        { wait: 2_000, maxWait: 30_000 })

    return {
        unload: () => save.flush(), // we may have pending savings
        middleware: ctx => async () => { // callback = execute after other middlewares are done
            const u = getCurrentUsername(ctx) || undefined
            const expiration = api.getConfig('hours') * 3600_000
            const quota = 1024 * 1024 * ((u && _.find(api.getConfig('perAccount'), { username: u })?.megabytes) ?? api.getConfig('megabytes'))
            const now = Date.now()
            const brandNewAccount = { b: 0, started: now }
            const account = u && (perAccount[u] ||= brandNewAccount)
            const expires = account?.started + expiration
            if (expires <= now)
                Object.assign(account, brandNewAccount)
            const left = quota - account?.b
            if (ctx.path === api.Const.API_URI + PREFIX + 'status') {
                ctx.status = 200
                return ctx.body = u ? JSON.stringify({ left }) : ''
            }
            if (!account) return // only with accounts
            if (ctx.status >= 300 || ctx.state.download_counter_ignore || ctx.state.considerAsGui) return
            if (!(ctx.state.vfsNode || ctx.state.archive)) return // not a download
            const size = ctx.length
            if (left < size) {
                ctx.status = api.Const.HTTP_TOO_MANY_REQUESTS
                ctx.type = 'text'
                ctx.set('content-disposition', '')
                const { t } = await api.i18n(ctx)
                ctx.body = t('downloadQuota_insufficient_quota', { left: formatBytes(left), expires: formatTimestamp(expires) },
                    "Cannot download file because only {left} of your quota is left. It will reset on {expires}")
                return
            }
            account.b += size
            save()
            const ofs = ctx.socket.bytesWritten
            ctx.socket.on('close', () => {
                const actual = ctx.socket.bytesWritten - ofs
                const diff = size - actual
                if (diff <= 0) return
                account.b -= diff
                save()
            })
        }
    }
}
