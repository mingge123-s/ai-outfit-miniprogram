const APP_PAIRS = [
  ["WX_APPID", "WX_SECRET"],
  ["WX_APPID_2", "WX_SECRET_2"]
];

export function loadWxApps(env = process.env) {
  const apps = [];
  for (const [idKey, secretKey] of APP_PAIRS) {
    const appid = String(env[idKey] || "").trim();
    const secret = String(env[secretKey] || "").trim();
    if (appid && secret) apps.push({ appid, secret });
  }
  return apps;
}

export async function exchangeWxCode(code, apps, fetchImpl = fetch) {
  if (!apps.length) return { openid: `dev_${code}`, appid: null };
  let lastErr = "微信登录失败";
  for (const app of apps) {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(app.appid)}&secret=${encodeURIComponent(app.secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const data = await (await fetchImpl(url)).json();
    if (data.openid) return { openid: data.openid, appid: app.appid };
    lastErr = data.errmsg || lastErr;
  }
  const err = new Error(lastErr);
  err.statusCode = 401;
  throw err;
}
