"use strict";{
    const PREFIX = 'dlQuota_'
    HFS.onEvent('userPanelAfterInfo', () => HFS.h(ShowQuota) )

    function ShowQuota() {
        const { data } = HFS.useApi(PREFIX + 'status')
        return HFS.h('div', {},
            HFS.t(PREFIX + 'left', { left: data ? HFS.misc.formatBytes(data.left) : '...' }, "Download quota left: {left}"))
    }
}