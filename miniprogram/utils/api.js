const { API_BASE_URL } = require('../config');

const TOKEN_KEY = 'auth_token';

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      timeout: 300000,
      header: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error((res.data && (res.data.error || res.data.details)) || `请求失败 (${res.statusCode})`));
      },
      fail: (err) => reject(new Error(err.errMsg || '网络错误'))
    });
  });
}

let loginPromise = null;

// 微信一键登录；后端未配置微信凭据时为开发模式（同一 code 即同一账号）
function ensureLogin() {
  if (getToken()) return Promise.resolve(getToken());
  if (loginPromise) return loginPromise;
  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        try {
          const data = await request('POST', '/api/login', { code: res.code });
          setToken(data.token);
          resolve(data.token);
        } catch (e) {
          reject(e);
        } finally {
          loginPromise = null;
        }
      },
      fail: (err) => {
        loginPromise = null;
        reject(new Error(err.errMsg || '微信登录失败'));
      }
    });
  });
  return loginPromise;
}

async function authedRequest(method, path, data) {
  await ensureLogin();
  try {
    return await request(method, path, data);
  } catch (e) {
    if (String(e.message).includes('未登录')) {
      setToken('');
      await ensureLogin();
      return request(method, path, data);
    }
    throw e;
  }
}

// 异步生成：提交任务后轮询直到完成/失败，返回 { imageUrl, taskId }
async function generateOutfit(body) {
  const { taskId } = await authedRequest('POST', '/api/tryon', body);
  while (true) {
    await new Promise((r) => setTimeout(r, 2500));
    const task = await authedRequest('GET', `/api/tryon/${taskId}`);
    if (task.status === 'done') return { imageUrl: `${API_BASE_URL}${task.imageUrl}`, taskId };
    if (task.status === 'failed') throw new Error(task.error || '生成失败');
  }
}

module.exports = {
  API_BASE_URL,
  generateOutfit,
  getToken,
  ensureLogin,
  request,
  authedRequest,
  wardrobe: {
    list: (category) => authedRequest('GET', `/api/wardrobe${category ? `?category=${category}` : ''}`),
    add: (category, image) => authedRequest('POST', '/api/wardrobe', { category, image }),
    remove: (id) => authedRequest('DELETE', `/api/wardrobe/${id}`)
  },
  personPhotos: {
    list: () => authedRequest('GET', '/api/person-photos'),
    add: (image) => authedRequest('POST', '/api/person-photos', { image }),
    remove: (id) => authedRequest('DELETE', `/api/person-photos/${id}`)
  },
  outfits: {
    list: () => authedRequest('GET', '/api/outfits'),
    add: (image, backgroundStyle, description, items, name, generationId) => authedRequest('POST', '/api/outfits', { image, generationId, backgroundStyle, description, items, name }),
    rename: (id, name) => authedRequest('PUT', `/api/outfits/${id}`, { name }),
    remove: (id) => authedRequest('DELETE', `/api/outfits/${id}`)
  }
};
