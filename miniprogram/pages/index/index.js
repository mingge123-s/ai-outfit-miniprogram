const { API_BASE_URL } = require('../../config');
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
    person: null,
    personPhotoId: null,
    personUrl: null,
    items: [
      { key: 'top', label: '上衣', icon: '👕', path: null },
      { key: 'pants', label: '裤子', icon: '👖', path: null },
      { key: 'shoes', label: '鞋子', icon: '👟', path: null },
      { key: 'hat', label: '帽子', icon: '🧢', path: null },
      { key: 'coat', label: '外套', icon: '🧥', path: null },
      { key: 'dress', label: '裙装', icon: '👗', path: null },
      { key: 'bag', label: '包包', icon: '👜', path: null },
      { key: 'accessory', label: '配饰', icon: '🧣', path: null },
      { key: 'socks', label: '袜子', icon: '🧦', path: null }
    ],
    showMore: false,
    styles: [
      { key: 'street', label: '街拍' },
      { key: 'studio', label: '影棚' },
      { key: 'outdoor', label: '户外' },
      { key: 'cafe', label: '咖啡馆' },
      { key: 'beach', label: '海边' },
      { key: 'campus', label: '校园' },
      { key: 'night', label: '夜景' },
      { key: 'snow', label: '雪地' },
      { key: 'home', label: '居家' },
      { key: 'custom', label: '自定义' }
    ],
    backgroundStyle: 'street',
    customBackground: '',
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
    if (this.data.person || this.data.personPhotoId) return;
    this.chooseImage((path) => this.setData({ person: path }));
  },

  removePerson() {
    this.setData({ person: null, personPhotoId: null, personUrl: null });
  },

  onShow() {
    // 从「我的」页选中的模特照
    const photo = app.globalData.personPhotoPick;
    if (photo) {
      app.globalData.personPhotoPick = null;
      this.setData({ person: null, personPhotoId: photo.id, personUrl: `${API_BASE_URL}${photo.imageUrl}` });
      wx.showToast({ title: '已选用模特照', icon: 'success' });
    }

    // 从套装收藏页回传的配件（批量填入）
    const parts = app.globalData.outfitPartsPick;
    if (parts && parts.length) {
      app.globalData.outfitPartsPick = null;
      const update = {};
      for (const p of parts) {
        const index = this.data.items.findIndex((i) => i.key === p.key);
        if (index >= 0) {
          update[`items[${index}].path`] = p.path;
          update[`items[${index}].wardrobeId`] = null;
          update[`items[${index}].imageUrl`] = null;
          if (index >= 4) update.showMore = true;
        }
      }
      this.setData(update, () => this.updateCanGenerate());
      wx.showToast({ title: `已填入 ${parts.length} 件配件`, icon: 'success' });
    }

    // 从衣柜选择页回传
    const pick = app.globalData.wardrobePick;
    if (pick) {
      app.globalData.wardrobePick = null;
      const index = this.data.items.findIndex((i) => i.key === pick.key);
      if (index >= 0) {
        this.setData(
          {
            [`items[${index}].path`]: null,
            [`items[${index}].wardrobeId`]: pick.item.id,
            [`items[${index}].imageUrl`]: `${API_BASE_URL}${pick.item.imageUrl}`,
            showMore: this.data.showMore || index >= 4
          },
          () => this.updateCanGenerate()
        );
      }
    }
  },

  chooseItem(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.items[index];
    if (item.path || item.wardrobeId) return;
    wx.showActionSheet({
      itemList: ['从相册/拍照上传', '从衣柜选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseImage((path) => {
            this.setData({ [`items[${index}].path`]: path }, () => this.updateCanGenerate());
          });
        } else {
          wx.navigateTo({ url: `/pages/picker/picker?category=${item.key}` });
        }
      }
    });
  },

  removeItem(e) {
    const index = e.currentTarget.dataset.index;
    this.setData(
      {
        [`items[${index}].path`]: null,
        [`items[${index}].wardrobeId`]: null,
        [`items[${index}].imageUrl`]: null
      },
      () => this.updateCanGenerate()
    );
  },

  // 把已上传的单品收藏进衣柜
  async saveItemToWardrobe(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.items[index];
    if (!item.path) return;
    wx.showLoading({ title: '收藏中…' });
    try {
      const data = await pathToBase64(item.path);
      await api.wardrobe.add(item.key, { data, mimeType: guessMimeType(item.path) });
      wx.showToast({ title: '已加入衣柜', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '收藏失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  toggleMore() {
    this.setData({ showMore: !this.data.showMore });
  },

  chooseStyle(e) {
    this.setData({ backgroundStyle: e.currentTarget.dataset.key });
  },

  onCustomBgInput(e) {
    this.setData({ customBackground: e.detail.value });
  },

  updateCanGenerate() {
    this.setData({ canGenerate: this.data.items.some((i) => i.path || i.wardrobeId) });
  },

  async generate() {
    if (!this.data.canGenerate || this.data.loading) return;
    this.setData({ loading: true });

    try {
      const items = {};
      for (const item of this.data.items) {
        if (item.wardrobeId) {
          items[item.key] = { wardrobeId: item.wardrobeId };
        } else if (item.path) {
          items[item.key] = {
            data: await pathToBase64(item.path),
            mimeType: guessMimeType(item.path)
          };
        }
      }
      const body = { items, backgroundStyle: this.data.backgroundStyle };
      if (this.data.backgroundStyle === 'custom') body.customBackground = this.data.customBackground;
      if (this.data.personPhotoId) {
        body.personImage = { personPhotoId: this.data.personPhotoId };
      } else if (this.data.person) {
        body.personImage = {
          data: await pathToBase64(this.data.person),
          mimeType: guessMimeType(this.data.person)
        };
      }

      await api.ensureLogin().catch(() => {});
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${API_BASE_URL}/api/tryon`,
          method: 'POST',
          data: body,
          timeout: 300000,
          header: api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : {},
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode !== 200 || !res.data.image) {
        throw new Error((res.data && res.data.error) || `请求失败 (${res.statusCode})`);
      }

      app.globalData.lastResult = {
        image: res.data.image,
        items: this.data.items
          .filter((i) => i.path || i.wardrobeId)
          .map(({ key, label, path, imageUrl }) => ({ key, label, path: path || imageUrl })),
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
