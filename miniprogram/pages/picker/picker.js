const api = require('../../utils/api');

const app = getApp();

const LABELS = { top: '上衣', pants: '裤子', shoes: '鞋子', hat: '帽子' };

Page({
  data: {
    category: 'top',
    label: '上衣',
    items: [],
    loading: true,
    baseUrl: api.API_BASE_URL
  },

  async onLoad(options) {
    const category = options.category || 'top';
    this.setData({ category, label: LABELS[category] || category });
    try {
      const data = await api.wardrobe.list(category);
      this.setData({ items: data.items });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  pick(e) {
    app.globalData.wardrobePick = { key: this.data.category, item: e.currentTarget.dataset.item };
    wx.navigateBack();
  }
});
