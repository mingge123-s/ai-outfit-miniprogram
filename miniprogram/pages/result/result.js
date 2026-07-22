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
    pending: false,
    failedError: '',
    regenerating: false,
    collecting: false,
    collected: false
  },

  onLoad() {
    const task = app.globalData.genTask;
    if (task && task.status === 'running') {
      this.setData({ pending: true, items: task.items });
      return;
    }
    const result = app.globalData.lastResult;
    if (!result) {
      wx.navigateBack();
      return;
    }
    this.setData({ image: result.image, items: result.items });
  },

  onShow() {
    app.genTaskListener = (task) => this.onTaskUpdate(task);
    // 页面重新展示时，任务可能已在后台完成
    const task = app.globalData.genTask;
    if (this.data.pending && task && task.status !== 'running') {
      this.onTaskUpdate(task);
    }
  },

  onHide() {
    if (app.genTaskListener) app.genTaskListener = null;
  },

  onUnload() {
    if (app.genTaskListener) app.genTaskListener = null;
  },

  onTaskUpdate(task) {
    if (task.status === 'done') {
      this.setData({
        pending: false,
        regenerating: false,
        failedError: '',
        image: task.image,
        items: task.items,
        collected: false
      });
    } else if (task.status === 'failed') {
      this.setData({ pending: false, regenerating: false, failedError: task.error || '生成失败' });
    } else {
      this.setData({ pending: true, failedError: '', items: task.items });
    }
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
    if (!body || this.data.regenerating || this.data.pending) return;
    this.setData({ regenerating: true });
    try {
      const { taskId } = await api.submitOutfit(body);
      const result = app.globalData.lastResult;
      app.trackGeneration(taskId, {
        items: (result && result.items) || this.data.items,
        backgroundStyle: result && result.backgroundStyle,
        request: body
      });
      this.setData({ regenerating: false, pending: true, failedError: '', collected: false });
    } catch (err) {
      this.setData({ regenerating: false });
      wx.showModal({
        title: '生成失败',
        content: (err && err.message) || err.errMsg || '请稍后重试',
        showCancel: false
      });
    }
  },

  editOutfit() {
    if (this.data.regenerating) return;
    wx.navigateBack();
  }
});
