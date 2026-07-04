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

module.exports = {
  API_BASE_URL,
  getToken,
  ensureLogin,
  request,
  authedRequest,
  wardrobe: {
    list: (category) => authedRequest('GET', `/api/wardrobe${category ? `?category=${category}` : ''}`),
    add: (category, image) => authedRequest('POST', '/api/wardrobe', { category, image }),
    remove: (id) => authedRequest('DELETE', `/api/wardrobe/${id}`)
  },
  outfits: {
    list: () => authedRequest('GET', '/api/outfits'),
    add: (image, backgroundStyle, description, items) => authedRequest('POST', '/api/outfits', { image, backgroundStyle, description, items }),
    remove: (id) => authedRequest('DELETE', `/api/outfits/${id}`)
  }
};
