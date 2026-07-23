const api = require('../../utils/api');
const { REWARDED_VIDEO_AD_UNIT_ID } = require('../../config');

const app = getApp();
let rewardedVideoAd = null;

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
    me: null,
    photos: [],
    history: [],
    baseUrl: api.API_BASE_URL,
    loading: false,
    adLoading: false,
    adConfigured: Boolean(REWARDED_VIDEO_AD_UNIT_ID)
  },

  onLoad() {
    this.initRewardedAd();
  },

  onShow() {
    this.refresh();
    // 订阅后台生成任务：完成/失败时刷新历史列表
    app.genTaskListener = (task) => {
      if (task.status === 'done') {
        wx.showToast({ title: '穿搭已生成', icon: 'success' });
        this.refresh();
      } else if (task.status === 'failed') {
        wx.showToast({ title: task.error || '生成失败', icon: 'none' });
        this.refresh();
      }
    };
  },

  onHide() {
    if (app.genTaskListener) app.genTaskListener = null;
  },

  onUnload() {
    if (app.genTaskListener) app.genTaskListener = null;
    if (rewardedVideoAd && rewardedVideoAd.destroy) rewardedVideoAd.destroy();
    rewardedVideoAd = null;
  },

  initRewardedAd() {
    if (!REWARDED_VIDEO_AD_UNIT_ID || !wx.createRewardedVideoAd) return;
    rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_VIDEO_AD_UNIT_ID });
    rewardedVideoAd.onError((err) => {
      this._adError = err;
    });
    rewardedVideoAd.onClose(async (res) => {
      const token = this._adRewardToken;
      this._adRewardToken = null;
      if (!res || !res.isEnded) {
        wx.showToast({ title: '完整看完广告才能领取', icon: 'none' });
        return;
      }
      if (!token) return;
      wx.showLoading({ title: '奖励到账中…' });
      try {
        const result = await api.adRewards.claim(token);
        await this.refresh();
        wx.hideLoading();
        wx.showToast({ title: `已获得 ${result.granted} 次`, icon: 'success' });
      } catch (e) {
        wx.hideLoading();
        wx.showModal({ title: '领取失败', content: e.message || '请稍后重试', showCancel: false });
      }
    });
    rewardedVideoAd.load().catch(() => {});
  },

  async refresh() {
    this.setData({ loading: true });
    try {
      const [me, photoData, historyData] = await Promise.all([
        api.authedRequest('GET', '/api/me'),
        api.personPhotos.list(),
        api.history.list()
      ]);
      this.setData({ me, photos: photoData.items, history: historyData.items });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  addPhoto() {
    const me = this.data.me || {};
    if (me.personPhotoCount >= me.personPhotoLimit) {
      wx.showModal({
        title: '模特照已满',
        content: `当前 ${me.personPhotoCount}/${me.personPhotoLimit} 张，请删除照片${me.memberLevel === 'free' ? '或开通会员扩容至 30 张' : '后再上传'}`,
        showCancel: false
      });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const path = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中…' });
        try {
          const data = await pathToBase64(path);
          await api.personPhotos.add({ data, mimeType: guessMimeType(path) });
          this.refresh();
        } catch (e) {
          wx.showToast({ title: e.message || '上传失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  async removePhoto(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.personPhotos.remove(id);
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err.message || '删除失败', icon: 'none' });
    }
  },

  usePhoto(e) {
    const photo = e.currentTarget.dataset.photo;
    app.globalData.personPhotoPick = photo;
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 按原图宽高比计算卡片宽度（高固定 480rpx），避免裁切或留白
  onHistoryImgLoad(e) {
    const { width, height } = e.detail || {};
    const index = e.currentTarget.dataset.index;
    if (!width || !height || index === undefined) return;
    const w = Math.max(240, Math.min(600, Math.round(480 * width / height)));
    if (this.data.history[index] && this.data.history[index]._w !== w) {
      this.setData({ [`history[${index}]._w`]: w });
    }
  },

  historyAction(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || item.status !== 'done' || !item.imageUrl) return;
    wx.showActionSheet({
      itemList: ['放大预览', '收藏套装'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.previewImage({ urls: [this.data.baseUrl + item.imageUrl] });
        } else if (res.tapIndex === 1) {
          this.collectHistory(item);
        }
      }
    });
  },

  collectHistory(item) {
    wx.showModal({
      title: '套装名字',
      editable: true,
      placeholderText: '给这套穿搭取个名字（可留空）',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '收藏中…' });
        try {
          await api.outfits.add(undefined, item.background, undefined, [], res.content || '', item.id);
          wx.hideLoading();
          wx.showToast({ title: '已收藏套装', icon: 'success' });
          this.refresh();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '收藏失败', icon: 'none' });
        }
      }
    });
  },

  removeHistory(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除生成记录',
      content: '删除后无法恢复，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.history.remove(id);
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  redeem() {
    wx.showModal({
      title: '兑换码',
      editable: true,
      placeholderText: '请输入兑换码',
      success: async (res) => {
        if (!res.confirm) return;
        const code = (res.content || '').trim();
        if (!code) return;
        wx.showLoading({ title: '兑换中…' });
        try {
          const r = await api.credits.redeem(code);
          wx.hideLoading();
          wx.showToast({ title: `已到账 ${r.credits} 次`, icon: 'success' });
          this.refresh();
        } catch (err) {
          wx.hideLoading();
          wx.showModal({ title: '兑换失败', content: err.message || '兑换码无效', showCancel: false });
        }
      }
    });
  },

  async watchAd() {
    const me = this.data.me || {};
    if (!REWARDED_VIDEO_AD_UNIT_ID) {
      wx.showToast({ title: '激励广告位尚未配置', icon: 'none' });
      return;
    }
    if (!me.rewardedAdEnabled) {
      wx.showToast({ title: '激励广告暂未开放', icon: 'none' });
      return;
    }
    if (!me.adRewardsRemainingToday) {
      wx.showToast({ title: '今日广告奖励已领取', icon: 'none' });
      return;
    }
    if (!rewardedVideoAd || this.data.adLoading) return;

    this.setData({ adLoading: true });
    try {
      const session = await api.adRewards.createSession();
      this._adRewardToken = session.token;
      if (rewardedVideoAd.setServerSideVerificationData) {
        rewardedVideoAd.setServerSideVerificationData({
          userId: String(me.userId),
          rewardItem: 'generation_credit',
          rewardAmount: session.rewardCredits,
          customData: session.token
        });
      }
      try {
        await rewardedVideoAd.show();
      } catch (e) {
        await rewardedVideoAd.load();
        await rewardedVideoAd.show();
      }
    } catch (e) {
      this._adRewardToken = null;
      wx.showModal({ title: '广告暂不可用', content: e.message || '请稍后重试', showCancel: false });
    } finally {
      this.setData({ adLoading: false });
    }
  },

  openVip() {
    if (this.data.me && this.data.me.memberLevel === 'member') {
      wx.showToast({ title: '会员权益已生效', icon: 'success' });
      return;
    }
    wx.showToast({ title: '充值功能开发中，可先用兑换码', icon: 'none' });
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
