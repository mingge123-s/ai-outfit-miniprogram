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
    batchUploading: false,
    batchTotal: 0,
    batchCompleted: 0,
    batchFailed: 0,
    batchProgress: 0,
    batchProcessingCount: 0,
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
    if (this.data.batchUploading) {
      wx.showToast({ title: '当前批次仍在上传', icon: 'none' });
      return;
    }
    this.chooseFromAlbum();
  },

  chooseFromAlbum() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => this.uploadBatch(res.tempFiles || [])
    });
  },

  async uploadBatch(files) {
    if (!files.length) return;

    const total = files.length;
    const uploadedIds = [];
    const uploadCategory = this.data.category === 'all' ? 'top' : this.data.category;
    let nextIndex = 0;
    let completed = 0;
    let failed = 0;

    this._batchPollToken = null;
    this.setData({
      batchUploading: true,
      batchTotal: total,
      batchCompleted: 0,
      batchFailed: 0,
      batchProgress: 0,
      batchProcessingCount: 0
    });
    wx.showToast({ title: `开始上传 ${total} 张`, icon: 'none' });

    const worker = async () => {
      while (nextIndex < total) {
        const file = files[nextIndex++];
        try {
          const path = file.tempFilePath;
          const data = await pathToBase64(path);
          const mimeType = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
          const resp = await api.wardrobe.add(uploadCategory, { data, mimeType });
          if (resp && resp.item && resp.item.id) uploadedIds.push(resp.item.id);
        } catch (e) {
          failed += 1;
        } finally {
          completed += 1;
          this.setData({
            batchCompleted: completed,
            batchFailed: failed,
            batchProgress: Math.round(completed * 100 / total)
          });
        }
      }
    };

    // 同时上传 2 张，避免大量 Base64 图片挤占手机内存和网络。
    const workerCount = Math.min(2, total);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    await this.refresh();

    this.setData({
      batchUploading: false,
      batchProcessingCount: uploadedIds.length
    });

    if (!uploadedIds.length) {
      wx.showToast({ title: '批量上传失败', icon: 'none' });
      return;
    }

    wx.showToast({
      title: failed ? `成功 ${uploadedIds.length}，失败 ${failed}` : `已入柜 ${uploadedIds.length} 张`,
      icon: failed ? 'none' : 'success'
    });
    this.pollBatchItems(uploadedIds);
  },

  // 每轮只拉一次衣柜列表，批量等待豆包识别和抠图完成。
  pollBatchItems(ids) {
    const token = Date.now();
    const idSet = new Set(ids.map(Number));
    this._batchPollToken = token;
    let tries = 0;

    const poll = async () => {
      if (this._batchPollToken !== token) return;
      try {
        const data = await api.wardrobe.list('');
        const allItems = data.items || [];
        const pending = allItems.filter((item) => idSet.has(Number(item.id)) && item.status === 'processing');
        this.setData({ batchProcessingCount: pending.length });

        if (this.data.category === 'all') {
          this.setData({ items: allItems });
        }
        if (!pending.length) {
          this._batchPollToken = null;
          await this.refresh();
          wx.showToast({ title: '豆包识别归类完成', icon: 'success' });
          return;
        }
      } catch (e) {}

      tries += 1;
      if (tries >= 90) {
        this._batchPollToken = null;
        this.setData({ batchProcessingCount: 0 });
        this.refresh();
        return;
      }
      setTimeout(poll, 2000);
    };

    poll();
  },

  onUnload() {
    this._batchPollToken = null;
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
