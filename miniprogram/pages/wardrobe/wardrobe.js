const api = require('../../utils/api');

const CATEGORIES = [
  { key: 'top', label: '上衣', icon: '👕' },
  { key: 'pants', label: '裤子', icon: '👖' },
  { key: 'shoes', label: '鞋子', icon: '👟' },
  { key: 'hat', label: '帽子', icon: '🧢' },
  { key: 'coat', label: '外套', icon: '🧥' },
  { key: 'dress', label: '裙装', icon: '👗' },
  { key: 'accessory', label: '配饰/包包', icon: '🧣' },
  { key: 'socks', label: '袜子', icon: '🧦' }
];

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

Page({
  data: {
    categories: CATEGORIES,
    category: 'top',
    items: [],
    loading: false,
    baseUrl: api.API_BASE_URL
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const data = await api.wardrobe.list(this.data.category);
      this.setData({ items: data.items });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  switchCategory(e) {
    this.setData({ category: e.currentTarget.dataset.key }, () => this.refresh());
  },

  addItem() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中…' });
        try {
          const data = await pathToBase64(path);
          const mimeType = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
          await api.wardrobe.add(this.data.category, { data, mimeType });
          await this.refresh();
          wx.showToast({ title: '已加入衣柜', icon: 'success' });
        } catch (e) {
          wx.showToast({ title: e.message || '上传失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  tapItem(e) {
    const item = e.currentTarget.dataset.item;
    wx.previewImage({ urls: [this.data.baseUrl + item.imageUrl] });
  },

  removeItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除单品',
      content: '确定从衣柜中删除这件单品吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.wardrobe.remove(id);
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  }
});
