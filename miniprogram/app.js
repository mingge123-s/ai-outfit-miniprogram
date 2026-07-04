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
    wardrobePick: null
  }
});
