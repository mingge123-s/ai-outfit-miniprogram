const api = require('./utils/api');

App({
  onLaunch() {
    // 启动即静默登录（微信 wx.login → 后端换 token；后端未配置微信凭据时为开发模式）
    api.ensureLogin().catch(() => {});
  },

  // 后台跟踪生成任务：页面提交后立即返回，用户可继续使用其他功能
  // meta: { items: [{key,label,path}], backgroundStyle, request }
  trackGeneration(taskId, meta) {
    this.stopGenerationPolling();
    const task = {
      taskId,
      status: 'running',
      image: '',
      error: '',
      items: (meta && meta.items) || [],
      backgroundStyle: meta && meta.backgroundStyle,
      request: meta && meta.request
    };
    this.globalData.genTask = task;
    this.notifyGenTask(task);
    const poll = async () => {
      try {
        const res = await api.getTask(taskId);
        if (res.status === 'done') {
          task.status = 'done';
          task.image = `${api.API_BASE_URL}${res.imageUrl}`;
          this.onGenerationSettled(task);
          return;
        }
        if (res.status === 'failed') {
          task.status = 'failed';
          task.error = res.error || '生成失败';
          this.onGenerationSettled(task);
          return;
        }
      } catch (e) {
        // 网络波动时继续轮询
      }
      this._genTimer = setTimeout(poll, 2500);
    };
    this._genTimer = setTimeout(poll, 2500);
  },

  onGenerationSettled(task) {
    this.stopGenerationPolling();
    if (task.status === 'done') {
      this.globalData.lastResult = {
        image: task.image,
        taskId: task.taskId,
        items: task.items,
        backgroundStyle: task.backgroundStyle
      };
      this.globalData.lastRequest = task.request;
    }
    const handled = this.notifyGenTask(task);
    if (!handled) {
      if (task.status === 'done') {
        wx.showToast({ title: '穿搭已生成，可在结果页查看', icon: 'none', duration: 2500 });
      } else {
        wx.showToast({ title: task.error || '生成失败', icon: 'none', duration: 2500 });
      }
    }
  },

  notifyGenTask(task) {
    if (typeof this.genTaskListener === 'function') {
      this.genTaskListener(task);
      return true;
    }
    return false;
  },

  stopGenerationPolling() {
    if (this._genTimer) {
      clearTimeout(this._genTimer);
      this._genTimer = null;
    }
  },

  globalData: {
    // 结果页数据：{ image: dataUrl, items: [{key,label,path}], backgroundStyle }
    lastResult: null,
    lastRequest: null,
    // 当前生成任务：{ taskId, status, image, error, items, backgroundStyle, request }
    genTask: null,
    // 衣柜选择回传：{ key, item }
    wardrobePick: null,
    // 衣柜页批量选择回传：[{ key, item }]
    wardrobeBatchPick: null,
    // 收藏套装的配件回传：[{ key, path }]
    outfitPartsPick: null,
    // 「我的」页选择的形象照
    personPhotoPick: null
  }
});
