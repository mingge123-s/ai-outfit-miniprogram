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

// 新号尚未开通微信定位接口。用户明确选择城市后，按市中心附近的坐标查询实时天气。
const CITIES = [
  { name: '北京', latitude: 39.9042, longitude: 116.4074 },
  { name: '上海', latitude: 31.2304, longitude: 121.4737 },
  { name: '广州', latitude: 23.1291, longitude: 113.2644 },
  { name: '深圳', latitude: 22.5431, longitude: 114.0579 },
  { name: '杭州', latitude: 30.2741, longitude: 120.1551 },
  { name: '南京', latitude: 32.0603, longitude: 118.7969 },
  { name: '成都', latitude: 30.5728, longitude: 104.0668 },
  { name: '重庆', latitude: 29.5630, longitude: 106.5516 },
  { name: '武汉', latitude: 30.5928, longitude: 114.3055 },
  { name: '西安', latitude: 34.3416, longitude: 108.9398 },
  { name: '苏州', latitude: 31.2989, longitude: 120.5853 },
  { name: '天津', latitude: 39.3434, longitude: 117.3616 },
  { name: '宁波', latitude: 29.8683, longitude: 121.5440 },
  { name: '长沙', latitude: 28.2282, longitude: 112.9388 },
  { name: '郑州', latitude: 34.7466, longitude: 113.6254 },
  { name: '青岛', latitude: 36.0671, longitude: 120.3826 },
  { name: '厦门', latitude: 24.4798, longitude: 118.0894 },
  { name: '福州', latitude: 26.0745, longitude: 119.2965 },
  { name: '济南', latitude: 36.6512, longitude: 117.1201 },
  { name: '合肥', latitude: 31.8206, longitude: 117.2272 },
  { name: '昆明', latitude: 25.0389, longitude: 102.7183 },
  { name: '沈阳', latitude: 41.8057, longitude: 123.4315 },
  { name: '大连', latitude: 38.9140, longitude: 121.6147 },
  { name: '哈尔滨', latitude: 45.8038, longitude: 126.5350 },
  { name: '长春', latitude: 43.8171, longitude: 125.3235 },
  { name: '石家庄', latitude: 38.0428, longitude: 114.5149 },
  { name: '太原', latitude: 37.8706, longitude: 112.5489 },
  { name: '呼和浩特', latitude: 40.8426, longitude: 111.7492 },
  { name: '南昌', latitude: 28.6829, longitude: 115.8582 },
  { name: '南宁', latitude: 22.8170, longitude: 108.3669 },
  { name: '贵阳', latitude: 26.6470, longitude: 106.6302 },
  { name: '海口', latitude: 20.0440, longitude: 110.1999 },
  { name: '三亚', latitude: 18.2528, longitude: 109.5119 },
  { name: '兰州', latitude: 36.0611, longitude: 103.8343 },
  { name: '西宁', latitude: 36.6171, longitude: 101.7782 },
  { name: '银川', latitude: 38.4872, longitude: 106.2309 },
  { name: '拉萨', latitude: 29.6500, longitude: 91.1000 },
  { name: '乌鲁木齐', latitude: 43.8256, longitude: 87.6168 },
  { name: '东莞', latitude: 23.0207, longitude: 113.7518 },
  { name: '佛山', latitude: 23.0215, longitude: 113.1214 },
  { name: '珠海', latitude: 22.2710, longitude: 113.5767 },
  { name: '无锡', latitude: 31.4912, longitude: 120.3119 },
  { name: '常州', latitude: 31.8122, longitude: 119.9741 },
  { name: '温州', latitude: 27.9949, longitude: 120.6994 },
  { name: '南通', latitude: 31.9796, longitude: 120.8943 },
  { name: '烟台', latitude: 37.4638, longitude: 121.4479 },
  { name: '泉州', latitude: 24.8741, longitude: 118.6757 },
  { name: '惠州', latitude: 23.1115, longitude: 114.4158 },
  { name: '中山', latitude: 22.5159, longitude: 113.3926 },
  { name: '香港', latitude: 22.3193, longitude: 114.1694 },
  { name: '澳门', latitude: 22.1987, longitude: 113.5439 },
  { name: '台北', latitude: 25.0330, longitude: 121.5654 }
];

Page({
  data: {
    occasions: [
      { key: 'daily', label: '日常' },
      { key: 'work', label: '通勤' },
      { key: 'date', label: '约会' },
      { key: 'sport', label: '运动' },
      { key: 'custom', label: '自定义' }
    ],
    manualPresets: [
      { key: 'cold', label: '寒冷' },
      { key: 'mild', label: '舒适' },
      { key: 'hot', label: '炎热' },
      { key: 'rain', label: '下雨' }
    ],
    occasion: 'daily',
    customOccasion: '',
    weatherMode: 'city',
    cityNames: ['请选择城市', ...CITIES.map((city) => city.name)],
    cityIndex: 0,
    selectedCityName: '',
    manualWeather: 'mild',
    manualWeatherLabel: '舒适',
    manualWeatherIcon: '/assets/icons/weather-comfy.png',
    backgrounds: [
      { key: 'smart', label: '智能场景' },
      { key: 'street', label: '街拍' },
      { key: 'home', label: '居家' },
      { key: 'custom', label: '自定义' }
    ],
    backgroundStyle: 'smart',
    customBackground: '',
    bgTags: [],
    bgTagLimit: 10,
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

  onShow() {
    this.loadBgTags();
  },

  async loadBgTags() {
    try {
      const { items, limit } = await api.backgroundTags.list();
      this.setData({ bgTags: items || [], bgTagLimit: limit || 10 });
    } catch (e) { /* 未登录等情况忽略 */ }
  },

  useBgTag(e) {
    this.setData({ customBackground: e.currentTarget.dataset.text });
  },

  async saveBgTag() {
    const text = this.data.customBackground.trim();
    if (!text) {
      wx.showToast({ title: '请先填写场景描述', icon: 'none' });
      return;
    }
    if (this.data.bgTags.some((t) => t.text === text)) {
      wx.showToast({ title: '该标签已存在', icon: 'none' });
      return;
    }
    try {
      const { item } = await api.backgroundTags.add(text);
      this.setData({ bgTags: [item, ...this.data.bgTags.filter((t) => t.id !== item.id)] });
      wx.showToast({ title: '已保存标签', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  removeBgTag(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除标签',
      content: '确定删除这个自定义背景标签？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.backgroundTags.remove(id);
          this.setData({ bgTags: this.data.bgTags.filter((t) => t.id !== id) });
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  selectWeatherMode(e) {
    if (this.data.loading || this.data.generating) return;
    const weatherMode = e.currentTarget.dataset.mode;
    if (weatherMode !== 'city' && weatherMode !== 'manual') return;
    if (weatherMode !== this.data.weatherMode) this.setData({ weatherMode, recommendation: null });
  },

  onCityChange(e) {
    if (this.data.loading || this.data.generating) return;
    const cityIndex = Number(e.detail.value);
    const city = CITIES[cityIndex - 1];
    if (cityIndex !== 0 && !city) return;
    this.setData({ cityIndex, selectedCityName: city ? city.name : '', recommendation: null });
  },

  selectManualWeather(e) {
    if (this.data.loading || this.data.generating) return;
    const preset = this.data.manualPresets.find((item) => item.key === e.currentTarget.dataset.key);
    if (!preset) return;
    this.setData({
      manualWeather: preset.key,
      manualWeatherLabel: preset.label,
      manualWeatherIcon: `/assets/icons/weather-${preset.key === 'mild' ? 'comfy' : preset.key}.png`,
      recommendation: null
    });
  },

  startRecommend() {
    if (this.data.weatherMode === 'city' && !this.data.selectedCityName) {
      wx.showToast({ title: '请先选择城市', icon: 'none' });
      return;
    }
    this.loadRecommendation(false);
  },

  async loadRecommendation(force) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      await this.requestRecommendation(Boolean(force));
    } catch (error) {
      const message = error.message || '请稍后重试';
      const wardrobeIncomplete = message.includes('衣柜还缺少');
      const weatherUnavailable = message.includes('天气查询');
      wx.showModal({
        title: weatherUnavailable ? '实时天气暂不可用' : '暂时无法推荐',
        content: message,
        confirmText: weatherUnavailable ? '用天气估计' : wardrobeIncomplete ? '去衣柜' : '知道了',
        cancelText: '关闭',
        showCancel: weatherUnavailable || wardrobeIncomplete,
        success: (result) => {
          if (!result.confirm) return;
          if (weatherUnavailable) this.setData({ weatherMode: 'manual', recommendation: null });
          else if (wardrobeIncomplete) wx.switchTab({ url: '/pages/wardrobe/wardrobe' });
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
    if (this.data.weatherMode === 'manual') {
      payload.manualWeather = this.data.manualWeather;
    } else {
      const city = CITIES.find((item) => item.name === this.data.selectedCityName);
      if (!city) throw new Error('请先选择城市，或切换为天气估计');
      payload.latitude = city.latitude;
      payload.longitude = city.longitude;
    }
    const recommendation = await api.todayOutfit.recommend(payload);
    recommendation.items = (recommendation.items || []).map((item) => ({
      ...item,
      label: CATEGORY_LABELS[item.category] || item.category
    }));
    recommendation.displayReason = this.data.weatherMode === 'manual'
      ? `按你选择的“${this.data.manualWeatherLabel}”天气估计，从衣柜挑选适合的单品；该估计并非实时天气。`
      : recommendation.reason;
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
