const api = require('../../utils/api');

Page({
  data: {
    me: null,
    loading: false
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const me = await api.authedRequest('GET', '/api/me');
      this.setData({ me });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
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
