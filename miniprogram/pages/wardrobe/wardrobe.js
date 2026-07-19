const api = require('../../utils/api');

const app = getApp();

const CATEGORIES = [
  { key: 'all', label: '全部', icon: '🗂️' },
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
    category: 'all',
    items: [],
    loading: false,
    baseUrl: api.API_BASE_URL,
    selected: {},
    selectedCount: 0,
    // 淘宝商品链接导入
    tbVisible: false,
    tbStep: 'input',
    tbUrl: '',
    tbLoading: false,
    tbTitle: '',
    tbImages: [],
    tbSelectedIndex: -1,
    tbCategory: 'top'
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const cat = this.data.category === 'all' ? '' : this.data.category;
      const data = await api.wardrobe.list(cat);
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
    this.chooseFromAlbum();
  },

  chooseFromAlbum() {
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
          const uploadCategory = this.data.category === 'all' ? 'top' : this.data.category;
          const resp = await api.wardrobe.add(uploadCategory, { data, mimeType });
          wx.hideLoading();
          await this.refresh();
          if (resp && resp.item && resp.item.status === 'processing') {
            wx.showToast({ title: '已入柜，AI识别中…', icon: 'none' });
            this.pollItem(resp.item.id, 0);
          } else {
            wx.showToast({ title: '已加入衣柜', icon: 'success' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: e.message || '上传失败', icon: 'none' });
        }
      }
    });
  },

  // 轮询后台处理结果（抠图 + AI 识别类别），完成后跳到识别出的分类
  pollItem(id, tries) {
    if (tries >= 15) { this.refresh(); return; }
    setTimeout(async () => {
      try {
        const r = await api.wardrobe.get(id);
        if (r && r.item && r.item.status !== 'processing') {
          const cat = r.item.category;
          const c = CATEGORIES.find((x) => x.key === cat);
          wx.showToast({ title: `AI识别为「${c ? c.label : cat}」`, icon: 'none' });
          if (this.data.category === 'all') {
            this.refresh();
          } else {
            this.setData({ category: cat }, () => this.refresh());
          }
          return;
        }
      } catch (e) {}
      this.pollItem(id, tries + 1);
    }, 1500);
  },

  // ===== 淘宝商品链接导入 =====
  openTaobao() {
    this.setData({
      tbVisible: true,
      tbStep: 'input',
      tbUrl: '',
      tbTitle: '',
      tbImages: [],
      tbSelectedIndex: -1,
      tbCategory: this.data.category
    });
  },

  closeTaobao() {
    this.setData({ tbVisible: false });
  },

  noop() {},

  onTbUrlInput(e) {
    this.setData({ tbUrl: e.detail.value });
  },

  async resolveTaobao() {
    const url = (this.data.tbUrl || '').trim();
    if (!url) {
      wx.showToast({ title: '请粘贴商品链接', icon: 'none' });
      return;
    }
    this.setData({ tbLoading: true });
    try {
      const data = await api.taobao.resolve(url);
      const images = (data.images || []).map((img) => img.url);
      if (!images.length) {
        wx.showToast({ title: '未获取到商品图片', icon: 'none' });
        return;
      }
      this.setData({
        tbStep: 'pick',
        tbTitle: data.title || '',
        tbImages: images,
        tbSelectedIndex: 0,
        tbCategory: data.suggestedCategory || this.data.category
      });
    } catch (e) {
      wx.showToast({ title: e.message || '解析失败', icon: 'none' });
    } finally {
      this.setData({ tbLoading: false });
    }
  },

  selectTbImage(e) {
    this.setData({ tbSelectedIndex: Number(e.currentTarget.dataset.index) });
  },

  previewTbImage(e) {
    const idx = Number(e.currentTarget.dataset.index);
    wx.previewImage({ current: this.data.tbImages[idx], urls: this.data.tbImages });
  },

  selectTbCategory(e) {
    this.setData({ tbCategory: e.currentTarget.dataset.key });
  },

  async importTaobao() {
    const { tbImages, tbSelectedIndex, tbCategory } = this.data;
    if (tbSelectedIndex < 0 || !tbImages[tbSelectedIndex]) {
      wx.showToast({ title: '请选择一张商品图', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '导入中…' });
    try {
      await api.taobao.import(tbCategory, tbImages[tbSelectedIndex]);
      this.setData({ tbVisible: false, category: tbCategory }, () => this.refresh());
      wx.showToast({ title: '已加入衣柜', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '导入失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  previewItem(e) {
    const item = e.currentTarget.dataset.item;
    wx.previewImage({ urls: [this.data.baseUrl + item.imageUrl] });
  },

  tapItem(e) {
    const item = e.currentTarget.dataset.item;
    const selected = Object.assign({}, this.data.selected);
    if (selected[item.category] && selected[item.category].id === item.id) {
      delete selected[item.category];
    } else {
      selected[item.category] = item;
    }
    this.setData({ selected, selectedCount: Object.keys(selected).length });
  },

  useSelected() {
    const picks = Object.keys(this.data.selected).map((key) => ({
      key,
      item: this.data.selected[key]
    }));
    if (!picks.length) return;
    app.globalData.wardrobeBatchPick = picks;
    this.setData({ selected: {}, selectedCount: 0 });
    wx.switchTab({ url: '/pages/index/index' });
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
          const selected = Object.assign({}, this.data.selected);
          for (const key of Object.keys(selected)) {
            if (selected[key].id === id) delete selected[key];
          }
          this.setData({ selected, selectedCount: Object.keys(selected).length });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  }
});
