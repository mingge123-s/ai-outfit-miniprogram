const { API_BASE_URL } = require('../../config');
const api = require('../../utils/api');

const app = getApp();

function imageToTempFile(image) {
  return new Promise((resolve, reject) => {
    if (/^https?:/.test(image)) {
      wx.downloadFile({
        url: image,
        success: (res) => (res.statusCode === 200 ? resolve(res.tempFilePath) : reject(new Error('下载失败'))),
        fail: reject
      });
      return;
    }
    const match = /^data:(image\/\w+);base64,(.+)$/.exec(image);
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
    regenerating: false,
    collecting: false,
    collected: false
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
      const filePath = await imageToTempFile(this.data.image);
      wx.previewImage({ urls: [filePath] });
    } catch (e) {
      // ignore
    }
  },

  async saveToAlbum() {
    try {
      const filePath = await imageToTempFile(this.data.image);
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

  collectOutfit() {
    if (this.data.collecting || this.data.collected) return;
    wx.showModal({
      title: '套装名字',
      editable: true,
      placeholderText: '给这套穿搭取个名字（可留空）',
      success: (res) => {
        if (!res.confirm) return;
        this.doCollect(res.content || '');
      }
    });
  },

  async doCollect(name) {
    this.setData({ collecting: true });
    try {
      const result = app.globalData.lastResult;
      const req = app.globalData.lastRequest;
      const items = req
        ? Object.keys(req.items || {}).map((category) => {
            const v = req.items[category];
            return v.wardrobeId
              ? { category, wardrobeId: v.wardrobeId }
              : { category, data: v.data, mimeType: v.mimeType };
          })
        : [];
      const taskId = result && result.taskId;
      await api.outfits.add(taskId ? undefined : { data: this.data.image }, result && result.backgroundStyle, undefined, items, name, taskId);
      this.setData({ collected: true });
      wx.showToast({ title: '已收藏套装', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '收藏失败', icon: 'none' });
    } finally {
      this.setData({ collecting: false });
    }
  },

  async regenerate() {
    const body = app.globalData.lastRequest;
    if (!body || this.data.regenerating) return;
    this.setData({ regenerating: true });
    try {
      const { imageUrl, taskId } = await api.generateOutfit(body);
      app.globalData.lastResult.image = imageUrl;
      app.globalData.lastResult.taskId = taskId;
      this.setData({ image: imageUrl, collected: false });
    } catch (err) {
      wx.showModal({
        title: '生成失败',
        content: (err && err.message) || err.errMsg || '请稍后重试',
        showCancel: false
      });
    } finally {
      this.setData({ regenerating: false });
    }
  },

  editOutfit() {
    if (this.data.regenerating) return;
    wx.navigateBack();
  }
});
