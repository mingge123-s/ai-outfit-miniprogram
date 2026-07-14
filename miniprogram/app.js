const api = require('./utils/api');

App({
  onLaunch() {
    // 启动即静默登录（微信 wx.login → 后端换 token；后端未配置微信凭据时为开发模式）
    api.ensureLogin().catch(() => {});
  },
  globalData: {
    // 结果页数据：{ image: dataUrl, items: [{key,label,path}], backgroundStyle }
    lastResult: null,
    lastRequest: null,
    // 衣柜选择回传：{ key, item }
    wardrobePick: null,
    // 衣柜页批量选择回传：[{ key, item }]
    wardrobeBatchPick: null,
    // 收藏套装的配件回传：[{ key, path }]
    outfitPartsPick: null,
    // 「我的」页选择的形象照
    personPhotoPick: null
  }
});
