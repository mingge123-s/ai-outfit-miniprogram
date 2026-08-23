const TAB_ITEMS = [
  {
    pagePath: 'pages/index/index',
    text: '首页',
    iconPath: 'assets/icons/tab-home.png',
    selectedIconPath: 'assets/icons/tab-home-active.png'
  },
  {
    pagePath: 'pages/wardrobe/wardrobe',
    text: '衣柜',
    iconPath: 'assets/icons/tab-briefcase.png',
    selectedIconPath: 'assets/icons/tab-briefcase-active.png'
  },
  {
    pagePath: 'pages/collection/collection',
    text: '收藏',
    iconPath: 'assets/icons/tab-heart.png',
    selectedIconPath: 'assets/icons/tab-heart-active.png'
  },
  {
    pagePath: 'pages/me/me',
    text: '我的',
    iconPath: 'assets/icons/tab-user.png',
    selectedIconPath: 'assets/icons/tab-user-active.png'
  }
];

Component({
  data: {
    selected: 0,
    list: TAB_ITEMS
  },
  lifetimes: {
    attached() {
      this.syncSelected();
    }
  },
  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },
  methods: {
    syncSelected() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const route = currentPage && currentPage.route;
      const selected = this.data.list.findIndex((item) => item.pagePath === route);

      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({ selected });
      }
    },
    switchTab(event) {
      const selected = Number(event.currentTarget.dataset.index);
      const item = this.data.list[selected];

      if (!item) return;

      this.setData({ selected });
      wx.switchTab({ url: `/${item.pagePath}` });
    }
  }
});
