const api = require('../../utils/api');
const app = getApp();

const CATEGORY_LABELS = {
  top: '上衣',
  pants: '裤子',
  shoes: '鞋子',
  hat: '帽子',
  coat: '外套',
  dress: '裙装',
  accessory: '配饰/包包',
  socks: '袜子'
};

function getFuzzyLocation() {
  return new Promise((resolve, reject) => {
    if (!wx.getFuzzyLocation) {
      reject(new Error('当前微信版本不支持模糊位置'));
      return;
    }
    wx.getFuzzyLocation({
      type: 'wgs84',
      success: resolve,
      fail: (error) => reject(new Error(error.errMsg || '无法获取位置'))
    });
  });
}

Page({
  data: {
    occasions: [
      { key: 'daily', label: '日常', icon: '☕' },
      { key: 'work', label: '通勤', icon: '💼' },
      { key: 'date', label: '约会', icon: '🌹' },
      { key: 'sport', label: '运动', icon: '🏃' },
      { key: 'custom', label: '自定义', icon: '✏️' }
    ],
    manualPresets: [
      { key: 'cold', label: '寒冷', icon: '🧥' },
      { key: 'mild', label: '舒适', icon: '🌤️' },
      { key: 'hot', label: '炎热', icon: '☀️' },
      { key: 'rain', label: '下雨', icon: '🌧️' }
    ],
    occasion: 'daily',
    customOccasion: '',
    manualMode: false,
    manualWeather: 'mild',
    backgrounds: [
      { key: 'smart', label: '智能场景' },
      { key: 'street', label: '街拍' },
      { key: 'home', label: '居家' },
      { key: 'custom', label: '自定义' }
    ],
    backgroundStyle: 'smart',
    customBackground: '',
    recommendation: null,
    baseUrl: api.API_BASE_URL,
    loading: false,
    generating: false
  },

  selectOccasion(e) {
    const occasion = e.currentTarget.dataset.key;
    this.setData({ occasion }, () => {
      if (occasion !== 'custom' && this.data.recommendation) this.loadRecommendation(false);
    });
  },

  onCustomOccasionInput(e) {
    this.setData({ customOccasion: e.detail.value });
  },

  confirmCustomOccasion() {
    if (!this.data.customOccasion.trim()) {
      wx.showToast({ title: '请先填写场合', icon: 'none' });
      return;
    }
    if (this.data.recommendation) this.loadRecommendation(false);
  },

  selectBackground(e) {
    this.setData({ backgroundStyle: e.currentTarget.dataset.key });
  },

  onCustomBackgroundInput(e) {
    this.setData({ customBackground: e.detail.value });
  },

  selectManualWeather(e) {
    this.setData({ manualWeather: e.currentTarget.dataset.key }, () => this.loadRecommendation(false));
  },

  startRecommend() {
    if (this.data.manualMode) this.loadRecommendation(false);
    else this.startWithLocation();
  },

  async startWithLocation() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const location = await getFuzzyLocation();
      this._location = { latitude: location.latitude, longitude: location.longitude };
      this.setData({ manualMode: false });
      await this.requestRecommendation(false);
    } catch (error) {
      this._location = null;
      this.setData({ manualMode: true });
      wx.showModal({
        title: '改用手动天气',
        content: '无法获取模糊位置。你可以选择当前天气，仍然能获得今日搭配。',
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadRecommendation(force) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      await this.requestRecommendation(Boolean(force));
    } catch (error) {
      wx.showModal({
        title: '暂时无法推荐',
        content: error.message || '请稍后重试',
        confirmText: '去衣柜',
        cancelText: '关闭',
        success: (result) => {
          if (result.confirm) wx.switchTab({ url: '/pages/wardrobe/wardrobe' });
        }
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async requestRecommendation(force) {
    const payload = {
      occasion: this.data.occasion,
      force
    };
    if (this.data.occasion === 'custom') {
      const text = this.data.customOccasion.trim();
      if (!text) throw new Error('请先填写自定义场合，如：音乐节、面试');
      payload.customOccasion = text;
    }
    if (this.data.manualMode || !this._location) {
      payload.manualWeather = this.data.manualWeather;
    } else {
      payload.latitude = this._location.latitude;
      payload.longitude = this._location.longitude;
    }
    const recommendation = await api.todayOutfit.recommend(payload);
    recommendation.items = (recommendation.items || []).map((item) => ({
      ...item,
      label: CATEGORY_LABELS[item.category] || item.category
    }));
    this.setData({ recommendation });
  },

  changeOutfit() {
    this.loadRecommendation(true);
  },

  goWardrobe() {
    wx.switchTab({ url: '/pages/wardrobe/wardrobe' });
  },

  async generateTodayOutfit() {
    const recommendation = this.data.recommendation;
    if (!recommendation || this.data.generating) return;
    this.setData({ generating: true });
    try {
      const items = {};
      for (const item of recommendation.items) {
        items[item.category] = { wardrobeId: item.id };
      }
      const style = this.data.backgroundStyle;
      const body = { items };
      if (style === 'smart') {
        body.backgroundStyle = 'custom';
        body.customBackground = recommendation.generationBackground;
      } else if (style === 'custom') {
        const custom = this.data.customBackground.trim();
        if (!custom) {
          wx.showToast({ title: '请先填写自定义场景描述', icon: 'none' });
          this.setData({ generating: false });
          return;
        }
        body.backgroundStyle = 'custom';
        body.customBackground = custom;
      } else {
        body.backgroundStyle = style;
      }
      const photos = await api.personPhotos.list();
      if (photos.items && photos.items.length) {
        body.personImage = { personPhotoId: photos.items[0].id };
      }
      const { taskId } = await api.submitOutfit(body);
      app.trackGeneration(taskId, {
        items: recommendation.items.map((item) => ({
          key: item.category,
          label: item.label,
          path: `${api.API_BASE_URL}${item.imageUrl}`
        })),
        backgroundStyle: body.backgroundStyle,
        request: body
      });
      wx.switchTab({ url: '/pages/me/me' });
    } catch (error) {
      wx.showModal({
        title: '生成失败',
        content: error.message || '请稍后重试',
        showCancel: false
      });
    } finally {
      this.setData({ generating: false });
    }
  }
});
