const api = require('../../utils/api');

const app = getApp();

Page({
  data: {
    items: [],
    loading: false,
    openId: null,
    selected: {},
    selectedCount: 0,
    labels: { top: '上衣', pants: '裤子', shoes: '鞋子', hat: '帽子' },
    baseUrl: api.API_BASE_URL
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const data = await api.outfits.list();
      this.setData({ items: data.items });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  toggleItems(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ openId: this.data.openId === id ? null : id, selected: {}, selectedCount: 0 });
  },

  togglePart(e) {
    const { cat, url } = e.currentTarget.dataset;
    const selected = Object.assign({}, this.data.selected);
    if (selected[cat] === url) delete selected[cat];
    else selected[cat] = url;
    this.setData({ selected, selectedCount: Object.keys(selected).length });
  },

  async useParts() {
    const selected = this.data.selected;
    const cats = Object.keys(selected);
    if (!cats.length) return;
    wx.showLoading({ title: '准备中…' });
    try {
      const picks = [];
      for (const cat of cats) {
        const res = await new Promise((resolve, reject) => {
          wx.downloadFile({ url: this.data.baseUrl + selected[cat], success: resolve, fail: reject });
        });
        picks.push({ key: cat, path: res.tempFilePath });
      }
      app.globalData.outfitPartsPick = picks;
      wx.switchTab({ url: '/pages/index/index' });
    } catch (e) {
      wx.showToast({ title: '加载配件失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  preview(e) {
    const url = this.data.baseUrl + e.currentTarget.dataset.url;
    wx.previewImage({ urls: [url] });
  },

  save(e) {
    const url = this.data.baseUrl + e.currentTarget.dataset.url;
    wx.downloadFile({
      url,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
        });
      },
      fail: () => wx.showToast({ title: '下载失败', icon: 'none' })
    });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消收藏',
      content: '确定删除这套穿搭吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.outfits.remove(id);
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  }
});
