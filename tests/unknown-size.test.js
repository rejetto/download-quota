const assert = require('node:assert/strict')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const test = require('node:test')

test('counts streamed bytes when a ZIP size is unknown', async () => {
    const body = Readable.from([Buffer.alloc(400_000), Buffer.alloc(648_576), Buffer.alloc(60)])
    const api = {
        Const: { API_URI: '/~/api/', HTTP_TOO_MANY_REQUESTS: 429 },
        storageDir: '/tmp',
        require: name => name === './misc' ? {
            debounceAsync: () => Object.assign(() => {}, { flush() {} }),
            formatBytes: String,
            formatTimestamp: String,
        } : name === './auth' ? {
            getCurrentUsername: () => 'tester',
        } : name === 'fs/promises' ? {
            readFile: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }) },
            writeFile: async () => {},
        } : name === 'lodash' ? {
            find: (values, wanted) => values.find(value => value.username === wanted.username),
        } : require(name),
        getConfig: key => ({ hours: 24, megabytes: 1, perAccount: [] })[key],
        i18n: async () => ({ t: () => 'quota exceeded' }),
        log() {},
    }
    const { middleware } = await require('../dist/plugin.js').init(api)
    const download = {
        path: '/archive.zip', status: 200, length: NaN, body,
        state: { archive: 'zip' },
    }

    const closed = once(body, 'close')
    await middleware(download)()
    await closed

    const status = { path: '/~/api/dlQuota_status', state: {} }
    await middleware(status)()
    assert.equal(JSON.parse(status.body).left, 0)

    const rejected = {
        path: '/other.zip', status: 200, length: undefined,
        body: Readable.from([Buffer.alloc(1)]), state: { archive: 'zip' },
        set() {},
    }
    await middleware(rejected)()
    assert.equal(rejected.status, 429)
})
