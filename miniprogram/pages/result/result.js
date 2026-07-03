const { API_BASE_URL } = require('../../config');

const app = getApp();

function dataUrlToTempFile(dataUrl) {
  return new Promise((resolve, reject) => {
    const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      reject(new Error('图片格式错误'));
      return;
    }
    const ext = match[1].split('/')[1] === 'jpeg' ? 'jpg' : match[1].split('/')[1];
    const filePath = `${wx.env.USER_DATA_PATH}/outfit_${Date.now()}.${ext}`;
    wx.getFileSystemManager().writeFile({
      filePath,
      data: match[2],
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

Page({
  data: {
    image: '',
    items: [],
    regenerating: false
  },

  onLoad() {
    const result = app.globalData.lastResult;
    if (!result) {
      wx.navigateBack();
      return;
    }
    this.setData({ image: result.image, items: result.items });
  },

  async previewImage() {
    try {
      const filePath = await dataUrlToTempFile(this.data.image);
      wx.previewImage({ urls: [filePath] });
    } catch (e) {
      // ignore
    }
  },

  async saveToAlbum() {
    try {
      const filePath = await dataUrlToTempFile(this.data.image);
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject });
      });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      if (err && err.errMsg && err.errMsg.includes('auth')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存图片到相册',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          }
        });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    }
  },

  async regenerate() {
    const body = app.globalData.lastRequest;
    if (!body || this.data.regenerating) return;
    this.setData({ regenerating: true });
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${API_BASE_URL}/api/tryon`,
          method: 'POST',
          data: body,
          timeout: 120000,
          success: resolve,
          fail: reject
        });
      });
      if (res.statusCode !== 200 || !res.data.image) {
        throw new Error((res.data && res.data.error) || `请求失败 (${res.statusCode})`);
      }
      app.globalData.lastResult.image = res.data.image;
      this.setData({ image: res.data.image });
    } catch (err) {
      wx.showModal({
        title: '生成失败',
        content: (err && err.message) || err.errMsg || '请稍后重试',
        showCancel: false
      });
    } finally {
      this.setData({ regenerating: false });
    }
  }
});
