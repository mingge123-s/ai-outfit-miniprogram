const api = require('../../utils/api');

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
    me: null,
    photos: [],
    baseUrl: api.API_BASE_URL,
    loading: false
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const me = await api.authedRequest('GET', '/api/me');
      const { items: photos } = await api.personPhotos.list();
      this.setData({ me, photos });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  addPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中…' });
        try {
          const data = await pathToBase64(path);
          await api.personPhotos.add({ data, mimeType: guessMimeType(path) });
          this.refresh();
        } catch (e) {
          wx.showToast({ title: e.message || '上传失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  async removePhoto(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.personPhotos.remove(id);
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err.message || '删除失败', icon: 'none' });
    }
  },

  usePhoto(e) {
    const photo = e.currentTarget.dataset.photo;
    app.globalData.personPhotoPick = photo;
    wx.switchTab({ url: '/pages/index/index' });
  },

  openVip() {
    wx.showToast({ title: '会员/充值功能开发中', icon: 'none' });
  },

  goWardrobe() {
    wx.switchTab({ url: '/pages/wardrobe/wardrobe' });
  },

  goCollection() {
    wx.switchTab({ url: '/pages/collection/collection' });
  },

  contact() {
    wx.showToast({ title: '客服功能开发中', icon: 'none' });
  },

  about() {
    wx.showModal({
      title: '关于',
      content: 'AI 穿搭生成小程序\n上传单品，一键生成模特穿搭效果图',
      showCancel: false
    });
  }
});
