// 第三方聚合商品详情（万邦/onebound taobao.item_get）：粘贴淘宝/天猫链接 -> 解析商品图。
// 仅在后端使用 key/secret，绝不下发到小程序。
const PROVIDER = process.env.TAOBAO_PROVIDER || "onebound";
const KEY = process.env.ONEBOUND_KEY || process.env.TAOBAO_APP_KEY || "";
const SECRET = process.env.ONEBOUND_SECRET || process.env.TAOBAO_APP_SECRET || "";
const BASE_URL = (process.env.ONEBOUND_BASE_URL || "https://api-gw.onebound.cn").replace(/\/+$/, "");

export const taobaoConfigured = () => PROVIDER === "onebound" && !!KEY && !!SECRET;

// 从淘宝/天猫商品链接或纯数字中提取 num_iid
export function extractItemId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (/^\d{6,}$/.test(raw)) return raw;
  let m = raw.match(/[?&#](?:id|itemId|item_id|num_iid)=(\d{6,})/i);
  if (m) return m[1];
  m = raw.match(/\/i(\d{6,})\.htm/i); // m.tb.cn 短路径形式
  if (m) return m[1];
  m = raw.match(/(?:item|detail)[^\d]{0,40}?(\d{9,})/i);
  if (m) return m[1];
  return null;
}

const CATEGORY_RULES = [
  ["socks", /袜/],
  ["hat", /帽|头巾|发带/],
  ["shoes", /鞋|靴|凉鞋|拖鞋|板鞋|运动鞋|高跟/],
  ["bag", /包(?!臀)|背包|双肩|挎包|手提|钱包|书包/],
  ["dress", /连衣裙|半身裙|裙/],
  ["coat", /外套|大衣|夹克|羽绒|风衣|棉服|棉衣|西装外套|皮衣|斗篷/],
  ["pants", /裤|牛仔裤|短裤|西裤|打底裤|legging|leggings/i],
  ["accessory", /围巾|腰带|皮带|领带|领结|眼镜|墨镜|项链|手链|手表|丝巾|发饰|胸针|耳/],
  ["top", /上衣|t恤|tee|衬衫|卫衣|针织|毛衣|背心|吊带|打底|polo|马甲/i]
];

export function guessCategory(title) {
  const t = String(title || "");
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return "top";
}

const normImg = (u) => {
  if (!u) return null;
  let s = String(u).trim();
  if (s.startsWith("//")) s = "https:" + s;
  else if (s.startsWith("http://")) s = "https://" + s.slice(7);
  return /^https:\/\//i.test(s) ? s : null;
};

// 调用 onebound item_get，返回 { title, itemId, suggestedCategory, images:[{url,position}] }
export async function resolveItem(url) {
  const itemId = extractItemId(url);
  if (!itemId) {
    const e = new Error("无法从链接识别商品ID，请粘贴淘宝/天猫商品链接或商品数字ID");
    e.status = 400;
    throw e;
  }
  if (!taobaoConfigured()) {
    const e = new Error("商品链接导入未配置，请在后端设置 ONEBOUND_KEY/ONEBOUND_SECRET");
    e.status = 503;
    throw e;
  }
  const qs = new URLSearchParams({
    key: KEY,
    secret: SECRET,
    api_name: "item_get",
    num_iid: itemId,
    result_type: "json",
    lang: "cn",
    cache: "no"
  });
  const api = `${BASE_URL}/taobao/item_get?${qs.toString()}`;
  let data;
  try {
    const resp = await fetch(api, { signal: AbortSignal.timeout(20000) });
    data = await resp.json();
  } catch (err) {
    const e = new Error("商品接口请求失败：" + (err?.message || err));
    e.status = 502;
    throw e;
  }
  const code = String(data?.error_code ?? "");
  if ((data?.error && code !== "0000") || (code && code !== "0000")) {
    const msg = data.reason || data.error || `错误码 ${code}`;
    const e = new Error("商品接口返回错误：" + msg);
    e.status = /限流|流控|qps|frequen/i.test(String(msg)) ? 429 : 502;
    throw e;
  }
  const item = data?.item;
  if (!item) {
    const e = new Error("未获取到该商品数据（部分类目不支持，请改用上传图片）");
    e.status = 404;
    throw e;
  }
  const urls = [];
  const push = (u) => { const n = normImg(u); if (n && !urls.includes(n)) urls.push(n); };
  push(item.pic_url);
  const imgs = Array.isArray(item.item_imgs) ? item.item_imgs : [];
  for (const im of imgs) push(typeof im === "string" ? im : im?.url);
  if (!urls.length) {
    const e = new Error("该商品没有可用图片，请改用上传图片");
    e.status = 404;
    throw e;
  }
  return {
    title: item.title || "",
    itemId: String(item.num_iid || itemId),
    suggestedCategory: guessCategory(item.title),
    images: urls.slice(0, 12).map((u, i) => ({ url: u, position: i + 1 }))
  };
}

// 服务端安全下载远程商品图，返回 { base64, mimeType }
export async function downloadImage(url) {
  const clean = normImg(url);
  if (!clean) {
    const e = new Error("图片地址不合法");
    e.status = 400;
    throw e;
  }
  const host = new URL(clean).hostname;
  if (!/(^|\.)(alicdn\.com|taobao\.com|tmall\.com|onebound\.cn)$/i.test(host)) {
    const e = new Error("仅允许下载淘宝/天猫商品图片");
    e.status = 400;
    throw e;
  }
  let resp;
  try {
    resp = await fetch(clean, { signal: AbortSignal.timeout(20000) });
  } catch (err) {
    const e = new Error("下载商品图片失败：" + (err?.message || err));
    e.status = 502;
    throw e;
  }
  if (!resp.ok) {
    const e = new Error("下载商品图片失败 (" + resp.status + ")");
    e.status = 502;
    throw e;
  }
  const mimeType = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  if (!/^image\//i.test(mimeType)) {
    const e = new Error("远程地址不是图片");
    e.status = 400;
    throw e;
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (!buf.length || buf.length > 12 * 1024 * 1024) {
    const e = new Error("图片为空或过大");
    e.status = 400;
    throw e;
  }
  return { base64: buf.toString("base64"), mimeType };
}
