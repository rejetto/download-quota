"use strict";{
    HFS.onEvent('userPanelAfterInfo', () => HFS.h(ShowQuota) )

    function ShowQuota() {
        return HFS.h('div', {}, HFS.t`Download quota left`, ': ', HFS.useApi('plugin_download_quota').data || '...')
    }
}