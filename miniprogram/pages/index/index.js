Page({
  goToday() {
    wx.navigateTo({ url: '/pages/today/today' });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/create/create' });
  },

  goWardrobe() {
    wx.switchTab({ url: '/pages/wardrobe/wardrobe' });
  },

  goCollection() {
    wx.switchTab({ url: '/pages/collection/collection' });
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  }
});
