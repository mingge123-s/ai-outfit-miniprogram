const { API_BASE_URL } = require('../../config');

const app = getApp();

function pathToBase64(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

function guessMimeType(path) {
  if (/\.png$/i.test(path)) return 'image/png';
  if (/\.webp$/i.test(path)) return 'image/webp';
  return 'image/jpeg';
}

Page({
  data: {
    person: null,
    items: [
      { key: 'top', label: '上衣', icon: '👕', path: null },
      { key: 'pants', label: '裤子', icon: '👖', path: null },
      { key: 'shoes', label: '鞋子', icon: '👟', path: null },
      { key: 'hat', label: '帽子', icon: '🧢', path: null }
    ],
    styles: [
      { key: 'street', label: '街拍' },
      { key: 'studio', label: '影棚' },
      { key: 'outdoor', label: '户外' }
    ],
    backgroundStyle: 'street',
    canGenerate: false,
    loading: false
  },

  chooseImage(cb) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => cb(res.tempFiles[0].tempFilePath)
    });
  },

  choosePerson() {
    if (this.data.person) return;
    this.chooseImage((path) => this.setData({ person: path }));
  },

  removePerson() {
    this.setData({ person: null });
  },

  chooseItem(e) {
    const index = e.currentTarget.dataset.index;
    if (this.data.items[index].path) return;
    this.chooseImage((path) => {
      this.setData({ [`items[${index}].path`]: path }, () => this.updateCanGenerate());
    });
  },

  removeItem(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`items[${index}].path`]: null }, () => this.updateCanGenerate());
  },

  chooseStyle(e) {
    this.setData({ backgroundStyle: e.currentTarget.dataset.key });
  },

  updateCanGenerate() {
    this.setData({ canGenerate: this.data.items.some((i) => i.path) });
  },

  async generate() {
    if (!this.data.canGenerate || this.data.loading) return;
    this.setData({ loading: true });

    try {
      const items = {};
      for (const item of this.data.items) {
        if (item.path) {
          items[item.key] = {
            data: await pathToBase64(item.path),
            mimeType: guessMimeType(item.path)
          };
        }
      }
      const body = { items, backgroundStyle: this.data.backgroundStyle };
      if (this.data.person) {
        body.personImage = {
          data: await pathToBase64(this.data.person),
          mimeType: guessMimeType(this.data.person)
        };
      }

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

      app.globalData.lastResult = {
        image: res.data.image,
        items: this.data.items.filter((i) => i.path).map(({ key, label, path }) => ({ key, label, path })),
        backgroundStyle: this.data.backgroundStyle
      };
      app.globalData.lastRequest = body;
      wx.navigateTo({ url: '/pages/result/result' });
    } catch (err) {
      wx.showModal({
        title: '生成失败',
        content: (err && err.message) || err.errMsg || '请检查网络或稍后重试',
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});
