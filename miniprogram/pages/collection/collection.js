const api = require('../../utils/api');

Page({
  data: {
    items: [],
    loading: false,
    openId: null,
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
    this.setData({ openId: this.data.openId === id ? null : id });
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
