import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { UPLOADS_DIR, saveImage, copyImage, loginUser, userByToken, userById, memberships, wardrobe, outfits, personPhotos, generations, credits, redeemCodes, adRewards, dailyOutfitRecommendations } from "./db.js";
import { taobaoConfigured, resolveItem, downloadImage } from "./taobao.js";
import { entitlementsFor } from "./entitlements.js";
import { OCCASIONS, buildCandidatePool, normalizeSelection, summarizeWeather, wardrobeRequirements, weatherFromPreset } from "./today-outfit.js";

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
const ARK_API_KEY = process.env.ARK_API_KEY || "";
const ARK_BASE_URL = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://api.mingge.asia/outfit").replace(/\/+$/, "");
// PROVIDER: "gemini" | "openai"（openai 兼容接口，如 ai.gs88.shop 等代理网关）| "ark"（火山方舟 豆包 Seedream）
const PROVIDER =
  process.env.PROVIDER || (ARK_API_KEY ? "ark" : OPENAI_API_KEY ? "openai" : "gemini");
const MODEL_ID =
  process.env.MODEL_ID ||
  (PROVIDER === "openai"
    ? "gpt-image-2"
    : PROVIDER === "ark"
      ? "doubao-seedream-5-0-pro-260628"
      : "gemini-2.5-flash-image-preview");
const IMAGE_QUALITY = process.env.IMAGE_QUALITY || "low";
const WX_APPID = process.env.WX_APPID || "";
const WX_SECRET = process.env.WX_SECRET || "";
const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT || 3);
const MEMBER_DAILY_LIMIT = Number(process.env.MEMBER_DAILY_LIMIT || 10);
const FREE_WARDROBE_LIMIT = Number(process.env.FREE_WARDROBE_LIMIT || 10);
const MEMBER_WARDROBE_LIMIT = Number(process.env.MEMBER_WARDROBE_LIMIT || 30);
const FREE_PERSON_PHOTO_LIMIT = Number(process.env.FREE_PERSON_PHOTO_LIMIT || 10);
const MEMBER_PERSON_PHOTO_LIMIT = Number(process.env.MEMBER_PERSON_PHOTO_LIMIT || 30);
const FREE_OUTFIT_LIMIT = Number(process.env.FREE_OUTFIT_LIMIT || 20);
const MEMBER_OUTFIT_LIMIT = Number(process.env.MEMBER_OUTFIT_LIMIT || 40);
const FREE_SIGNUP_CREDITS = Number(process.env.FREE_SIGNUP_CREDITS || 0);
const CREDITS_PER_GENERATION = Number(process.env.CREDITS_PER_GENERATION || 1); // 每次生成消耗积分
const REWARDED_AD_ENABLED = process.env.REWARDED_AD_ENABLED === "1";
const AD_REWARD_CREDITS = Number(process.env.AD_REWARD_CREDITS || 1);
const AD_DAILY_REWARD_LIMIT = Number(process.env.AD_DAILY_REWARD_LIMIT || 1);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // 管理员接口令牌（未配置则关闭管理接口）
const ENTITLEMENT_LIMITS = {
  freeDailyLimit: FREE_DAILY_LIMIT,
  memberDailyLimit: MEMBER_DAILY_LIMIT,
  freeWardrobeLimit: FREE_WARDROBE_LIMIT,
  memberWardrobeLimit: MEMBER_WARDROBE_LIMIT,
  freePersonPhotoLimit: FREE_PERSON_PHOTO_LIMIT,
  memberPersonPhotoLimit: MEMBER_PERSON_PHOTO_LIMIT,
  freeOutfitLimit: FREE_OUTFIT_LIMIT,
  memberOutfitLimit: MEMBER_OUTFIT_LIMIT,
};
// 充值套餐（仅展示/未来接入微信支付用，当前不收真实费用）
const CREDIT_PACKAGES = [
  { id: "starter", priceFen: 100, credits: 3, label: "体验包" },
  { id: "standard", priceFen: 990, credits: 20, label: "标准包" },
  { id: "pro", priceFen: 2990, credits: 80, label: "超值包" },
];
const AUTO_CUTOUT = process.env.AUTO_CUTOUT !== "0"; // 衣柜上传自动抠图（需安装 rembg）
// 上传后使用低成本豆包视觉模型识别衣物类别，复用火山方舟 ARK_API_KEY。
const ARK_VISION_MODEL = process.env.ARK_VISION_MODEL || "doubao-seed-2-0-mini-260215";
const AUTO_CATEGORY = process.env.AUTO_CATEGORY !== "0";

if (PROVIDER === "gemini" && !GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable.");
}
if (PROVIDER === "openai" && !OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable.");
}
if (PROVIDER === "ark" && !ARK_API_KEY) {
  console.error("Missing ARK_API_KEY environment variable.");
}

const ai = PROVIDER === "gemini" ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: "40mb" }));
app.use(express.static(new URL("./public", import.meta.url).pathname));
app.use("/uploads", express.static(UPLOADS_DIR));

// 登录：微信 code2session；未配置 WX_APPID/WX_SECRET 时走开发模式（code 即账号标识）
app.post("/api/login", async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: "缺少 code" });
    let openid;
    if (WX_APPID && WX_SECRET) {
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
      const data = await (await fetch(url)).json();
      if (!data.openid) return res.status(401).json({ error: "微信登录失败", details: data.errmsg });
      openid = data.openid;
    } else {
      openid = `dev_${code}`;
    }
    const user = loginUser(openid);
    return res.json({ token: user.token, userId: user.id, devMode: !(WX_APPID && WX_SECRET) });
  } catch (err) {
    return res.status(500).json({ error: "登录失败", details: String(err) });
  }
});

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = userByToken(token);
  if (!user) return res.status(401).json({ error: "未登录" });
  credits.ensureAccount(user.id, FREE_SIGNUP_CREDITS); // 幂等：确保积分账户存在
  req.user = user;
  next();
}

// 管理员接口鉴权：需配置 ADMIN_TOKEN，并在请求头 x-admin-token 携带
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: "管理接口未开启（未配置 ADMIN_TOKEN）" });
  const token = req.headers["x-admin-token"];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: "管理员校验失败" });
  next();
}

// 计算余额/额度快照
function quotaSnapshot(user) {
  const entitlement = entitlementsFor(user, ENTITLEMENT_LIMITS);
  const usedFreeToday = generations.countTodayFree(user.id);
  const remainingFreeToday = Math.max(0, entitlement.dailyLimit - usedFreeToday);
  const creditBalance = credits.balance(user.id);
  const adRewardsUsedToday = adRewards.countToday(user.id);
  return {
    ...entitlement,
    usedFreeToday,
    remainingFreeToday,
    credits: creditBalance,
    creditsPerGeneration: CREDITS_PER_GENERATION,
    rewardedAdEnabled: REWARDED_AD_ENABLED,
    adRewardCredits: AD_REWARD_CREDITS,
    adDailyRewardLimit: AD_DAILY_REWARD_LIMIT,
    adRewardsUsedToday,
    adRewardsRemainingToday: Math.max(0, AD_DAILY_REWARD_LIMIT - adRewardsUsedToday),
    // 今日实际还能生成的次数（免费 + 积分可支撑）
    remainingToday: remainingFreeToday + Math.floor(creditBalance / CREDITS_PER_GENERATION),
  };
}

const imageUrl = (file) => `/uploads/${file}`;

// 我的信息
app.get("/api/me", requireAuth, (req, res) => {
  const q = quotaSnapshot(req.user);
  res.json({
    userId: req.user.id,
    nickname: req.user.nickname || null,
    createdAt: req.user.created_at,
    devMode: !(WX_APPID && WX_SECRET),
    wardrobeCount: wardrobe.list(req.user.id).length,
    outfitCount: outfits.list(req.user.id).length,
    personPhotoCount: personPhotos.list(req.user.id).length,
    ...q,
    taobaoImport: taobaoConfigured(),
  });
});

// 积分账户：余额、额度、套餐（套餐仅展示，暂不收真钱）
app.get("/api/credits", requireAuth, (req, res) => {
  res.json({
    ...quotaSnapshot(req.user),
    transactions: credits.transactions(req.user.id, 30).map((t) => ({
      amount: t.amount, balanceAfter: t.balance_after, type: t.type, reason: t.reason, createdAt: t.created_at,
    })),
    packages: CREDIT_PACKAGES, // 未来接入微信支付后开放购买
    purchaseEnabled: false,
  });
});

// 兑换码兑换
app.post("/api/credits/redeem", requireAuth, (req, res) => {
  const code = String((req.body || {}).code || "").trim();
  if (!code) return res.status(400).json({ error: "请输入兑换码" });
  const r = redeemCodes.redeem(req.user.id, code);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ credits: r.credits, remainingCredits: r.remainingCredits, ...quotaSnapshot(req.user) });
});

// 激励广告：先创建短期凭证，客户端确认完整看完后凭此领取一次机会。
app.post("/api/ad-rewards/session", requireAuth, (req, res) => {
  if (!REWARDED_AD_ENABLED) return res.status(503).json({ error: "激励广告暂未开放" });
  const result = adRewards.createSession(req.user.id, AD_DAILY_REWARD_LIMIT);
  if (!result.ok) return res.status(429).json({ error: result.error, ...quotaSnapshot(req.user) });
  res.json({
    token: result.token,
    expiresAt: result.expiresAt,
    rewardCredits: AD_REWARD_CREDITS,
    ...quotaSnapshot(req.user),
  });
});

app.post("/api/ad-rewards/claim", requireAuth, (req, res) => {
  if (!REWARDED_AD_ENABLED) return res.status(503).json({ error: "激励广告暂未开放" });
  const token = String((req.body || {}).token || "").trim();
  if (!token) return res.status(400).json({ error: "缺少广告奖励凭证" });
  const result = adRewards.claim(req.user.id, token, AD_DAILY_REWARD_LIMIT, AD_REWARD_CREDITS);
  if (!result.ok) return res.status(400).json({ error: result.error, ...quotaSnapshot(req.user) });
  res.json({ granted: result.credits, balance: result.balance, ...quotaSnapshot(req.user) });
});

// ===== 管理员接口（需 ADMIN_TOKEN；不涉及真实支付）=====
// 给指定用户充值积分
app.post("/api/admin/credits/grant", requireAdmin, (req, res) => {
  const { userId, amount, reason } = req.body || {};
  const uid = Number(userId);
  const amt = Number(amount);
  if (!uid) return res.status(400).json({ error: "缺少 userId" });
  if (!userById(uid)) return res.status(404).json({ error: "用户不存在" });
  if (!Number.isInteger(amt) || amt === 0) return res.status(400).json({ error: "amount 必须为非零整数" });
  credits.ensureAccount(uid, 0);
  const balance = credits.grant(uid, amt, "admin_adjust", reason || "管理员充值");
  res.json({ userId: uid, amount: amt, balance });
});

// 设置会员等级；member 不传有效期时为永久会员。
app.post("/api/admin/membership", requireAdmin, (req, res) => {
  const { userId, level, days, expiresAt } = req.body || {};
  const uid = Number(userId);
  if (!uid) return res.status(400).json({ error: "缺少 userId" });
  if (!["free", "member"].includes(level)) return res.status(400).json({ error: "level 必须为 free/member" });
  const target = userById(uid);
  if (!target) return res.status(404).json({ error: "用户不存在" });

  let expiry = null;
  if (level === "member" && days != null) {
    const duration = Number(days);
    if (!Number.isFinite(duration) || duration <= 0) return res.status(400).json({ error: "days 必须为正数" });
    expiry = new Date(Date.now() + duration * 86400000).toISOString();
  } else if (level === "member" && expiresAt) {
    const timestamp = Date.parse(expiresAt);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return res.status(400).json({ error: "expiresAt 必须是未来时间" });
    expiry = new Date(timestamp).toISOString();
  }

  const updated = memberships.set(uid, level, expiry);
  res.json({ userId: uid, ...entitlementsFor(updated, ENTITLEMENT_LIMITS) });
});

// 生成兑换码
app.post("/api/admin/redeem-codes", requireAdmin, (req, res) => {
  const { credits: creditsAmount, count = 1, maxUses = 1, expiresAt = null, reason = null } = req.body || {};
  const amt = Number(creditsAmount);
  const n = Math.min(Math.max(1, Number(count) || 1), 200);
  if (!Number.isInteger(amt) || amt <= 0) return res.status(400).json({ error: "credits 必须为正整数" });
  const out = [];
  for (let i = 0; i < n; i++) {
    let code;
    for (let t = 0; t < 5; t++) {
      code = "WF" + Math.random().toString(36).slice(2, 10).toUpperCase();
      try { const rc = redeemCodes.create(code, amt, Number(maxUses) || 1, expiresAt, reason); out.push({ code: rc.code, credits: rc.credits }); break; }
      catch { code = null; }
    }
  }
  res.json({ codes: out });
});

// 自动抠图（rembg，开源本地去背景）；不可用或失败时回退原图
let rembgAvailable = null;
async function checkRembg() {
  if (rembgAvailable !== null) return rembgAvailable;
  rembgAvailable = await new Promise((resolve) => {
    const p = spawn("rembg", ["--help"]);
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  console.log(rembgAvailable ? "rembg 可用，衣柜上传将自动抠图" : "rembg 不可用，跳过自动抠图（pip install rembg[cli] 可启用）");
  return rembgAvailable;
}
async function removeBackground(file) {
  if (!AUTO_CUTOUT || !(await checkRembg())) return null;
  const input = path.join(UPLOADS_DIR, file);
  const outName = file.replace(/\.[^.]+$/, "") + "_cut.png";
  const output = path.join(UPLOADS_DIR, outName);
  const ok = await new Promise((resolve) => {
    const p = spawn("rembg", ["i", input, output]);
    const t = setTimeout(() => { p.kill(); resolve(false); }, 120000);
    p.on("error", () => { clearTimeout(t); resolve(false); });
    p.on("exit", (code) => { clearTimeout(t); resolve(code === 0); });
  });
  if (ok && fs.existsSync(output) && fs.statSync(output).size > 0) {
    fs.unlinkSync(input);
    return outName;
  }
  try { fs.unlinkSync(output); } catch {}
  return null;
}

// 豆包识别衣物类别（返回 wardrobe 支持的分类键；失败返回 null 回退用户所选分类）
const WARDROBE_CATS = ["top", "pants", "shoes", "hat", "coat", "dress", "accessory", "socks"];
async function classifyCategory(file) {
  if (!AUTO_CATEGORY || !ARK_API_KEY) return null;
  const input = path.join(UPLOADS_DIR, file);
  if (!fs.existsSync(input)) return null;
  try {
    const b64 = fs.readFileSync(input).toString("base64");
    const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    const prompt =
      "这是一张衣物或配件的商品图。请判断类别并提取特征，只输出严格 JSON（不要 Markdown）：" +
      '{"category":"top|pants|shoes|hat|coat|dress|skirt|bag|socks|accessory","color":"主色调中文2-4字","warmth":"薄|适中|厚","style":"风格中文2-4字如休闲/通勤/运动/甜美"}。' +
      "类别说明：top(上衣) pants(裤子) shoes(鞋) hat(帽子) coat(外套) dress(裙装/连衣裙) skirt(半身裙) bag(包) socks(袜子) accessory(其他配饰如围巾/腰带/首饰/眼镜)。";
    const resp = await fetch(`${ARK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ARK_API_KEY}` },
      body: JSON.stringify({
        model: ARK_VISION_MODEL,
        thinking: { type: "disabled" },
        max_tokens: 100,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      const details = await resp.text().catch(() => "");
      console.error(`豆包衣物识别失败 (${resp.status}):`, details.slice(0, 300));
      return null;
    }
    const data = await resp.json();
    const raw = String(data?.choices?.[0]?.message?.content || "");
    let parsed = null;
    try { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch {}
    const catSource = String(parsed?.category || raw).toLowerCase();
    const m = catSource.match(/top|pants|shoes|hat|coat|dress|skirt|bag|socks|accessory/);
    if (!m) return null;
    let cat = m[0];
    if (cat === "skirt") cat = "dress"; // 半身裙归入裙装
    if (cat === "bag") cat = "accessory"; // 包归入配饰/包包分类
    if (!WARDROBE_CATS.includes(cat)) return null;
    const attrs = {};
    for (const key of ["color", "warmth", "style"]) {
      const v = typeof parsed?.[key] === "string" ? parsed[key].trim().slice(0, 12) : "";
      if (v) attrs[key] = v;
    }
    return { category: cat, attrs: Object.keys(attrs).length ? attrs : null };
  } catch (e) {
    console.error("豆包衣物识别异常:", e?.message || e);
    return null;
  }
}

// 后台异步处理单品：AI 识别类别 + 抠图，完成后更新入柜记录
async function processWardrobeItem(userId, id, file, fallbackCategory) {
  let category = fallbackCategory;
  let imageFile = file;
  let attrs = null;
  try {
    const result = await classifyCategory(file).catch(() => null);
    if (result?.category) category = result.category;
    if (result?.attrs) attrs = JSON.stringify(result.attrs);
    const cut = await removeBackground(file).catch(() => null);
    if (cut) imageFile = cut;
  } catch (e) {
    console.error("processWardrobeItem error:", e?.message || e);
  } finally {
    wardrobe.update(userId, id, { category, imageFile, status: "ready", attrs });
  }
}

// 批量上传时串行处理，避免同时启动多个 rembg 进程挤占服务器内存。
const wardrobeProcessQueue = [];
let wardrobeProcessRunning = false;
function enqueueWardrobeItem(task) {
  wardrobeProcessQueue.push(task);
  void pumpWardrobeProcessQueue().catch((e) => {
    console.error("衣柜后台处理队列异常:", e?.message || e);
  });
}
async function pumpWardrobeProcessQueue() {
  if (wardrobeProcessRunning) return;
  wardrobeProcessRunning = true;
  try {
    while (wardrobeProcessQueue.length) {
      const task = wardrobeProcessQueue.shift();
      await processWardrobeItem(task.userId, task.id, task.file, task.fallbackCategory);
    }
  } finally {
    wardrobeProcessRunning = false;
  }
}

const OCCASION_LABELS = {
  daily: "日常",
  work: "通勤",
  date: "约会",
  sport: "运动",
  travel: "旅行",
};

async function fetchCurrentWeather(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    const error = new Error("位置信息无效");
    error.statusCode = 400;
    throw error;
  }
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`weather ${response.status}`);
    const data = await response.json();
    if (!data.current) throw new Error("weather payload missing");
    return summarizeWeather(data.current, data.timezone || "auto");
  } catch (error) {
    console.error("天气查询失败:", error?.message || error);
    const wrapped = new Error("天气查询暂时不可用，请选择手动天气");
    wrapped.statusCode = 502;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

function weatherDateKey(weather) {
  if (weather.observedAt) return String(weather.observedAt).slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function recommendationBackground(weather, occasion) {
  const scene = occasion === "work"
    ? "a modern business district"
    : occasion === "date"
      ? "an elegant city cafe street"
      : occasion === "sport"
        ? "a clean urban park path"
        : occasion === "travel"
          ? "a scenic pedestrian travel destination"
          : "a stylish city sidewalk";
  const climate = weather.isRain
    ? "light rainy weather with a sheltered dry walking area"
    : weather.isSnow
      ? "a bright winter scene with light snow"
      : weather.condition === "clear"
        ? "clear natural daylight"
        : "soft overcast daylight";
  return `${scene}, ${climate}, temperature around ${weather.temperature}°C, photorealistic and suitable for a full-body fashion photo`;
}

function parseRecommendationContent(content) {
  const text = String(content || "").replace(/```(?:json)?|```/gi, "").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function describeAttrs(attrsJson) {
  if (!attrsJson) return "";
  try {
    const a = typeof attrsJson === "string" ? JSON.parse(attrsJson) : attrsJson;
    const parts = [];
    if (a.color) parts.push(`颜色${a.color}`);
    if (a.warmth) parts.push(`厚薄${a.warmth}`);
    if (a.style) parts.push(`风格${a.style}`);
    return parts.length ? `，${parts.join("，")}` : "";
  } catch {
    return "";
  }
}

async function selectTodayOutfit(candidates, weather, occasion, excludedIds = []) {
  const variation = excludedIds.length
    ? `这是“换一套”请求，尽量不要选择上一套的这些 ID：${excludedIds.join(", ")}。`
    : "";
  const content = [{
    type: "text",
    text: `你是专业穿搭顾问。根据天气和场景，从候选衣柜图片中选择一套协调、完整、实穿的穿搭。
天气：${weather.conditionLabel}，${weather.temperature}°C，体感 ${weather.apparentTemperature}°C，湿度 ${weather.humidity}%，风速 ${weather.windSpeed}km/h，降水 ${weather.precipitation}mm。
场景：${OCCASION_LABELS[occasion]}。
规则：
1. 必须选择 dress（裙装），或者同时选择 top（上衣）+ pants（裤子）。
2. 必须选择 shoes（鞋子）。
3. 体感不高于16°C、雨雪或大风时，衣柜有 coat（外套）就必须选择。
4. 每个类别最多一件；总数 3-6 件；颜色和风格要协调。
5. 只能使用候选列表中的 ID。
${variation}
只输出严格 JSON，不要 Markdown：{"selectedIds":[数字ID],"title":"10字内标题","reason":"50字内中文理由","scene":"25字内的具体拍摄场景画面描述，要和天气、场景、这套穿搭的风格彼此呼应，如：樱花树下的小路"}`,
  }];
  for (const item of candidates) {
    content.push({ type: "text", text: `候选 ID=${item.id}，类别=${item.category}${describeAttrs(item.attrs)}` });
    content.push({
      type: "image_url",
      image_url: { url: `${PUBLIC_BASE_URL}${imageUrl(item.image_file)}`, detail: "low" },
    });
  }

  if (!ARK_API_KEY) return null;
  try {
    const response = await fetch(`${ARK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ARK_API_KEY}` },
      body: JSON.stringify({
        model: ARK_VISION_MODEL,
        thinking: { type: "disabled" },
        max_tokens: 300,
        temperature: 0.2,
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) {
      console.error(`今日搭配分析失败 (${response.status}):`, (await response.text()).slice(0, 300));
      return null;
    }
    const data = await response.json();
    return parseRecommendationContent(data?.choices?.[0]?.message?.content);
  } catch (error) {
    console.error("今日搭配分析异常:", error?.message || error);
    return null;
  }
}

// 我的模特照（全身照，可多张）
app.get("/api/person-photos", requireAuth, (req, res) => {
  const rows = personPhotos.list(req.user.id);
  const entitlement = entitlementsFor(req.user, ENTITLEMENT_LIMITS);
  const items = rows.map((p) => ({
    id: p.id, imageUrl: imageUrl(p.image_file), createdAt: p.created_at,
  }));
  res.json({
    items,
    count: rows.length,
    limit: entitlement.personPhotoLimit,
    memberLevel: entitlement.memberLevel,
  });
});
app.post("/api/person-photos", requireAuth, (req, res) => {
  const { image } = req.body || {};
  if (!image?.data) return res.status(400).json({ error: "缺少图片数据" });
  const entitlement = entitlementsFor(req.user, ENTITLEMENT_LIMITS);
  const photoCount = personPhotos.list(req.user.id).length;
  if (photoCount >= entitlement.personPhotoLimit) {
    return res.status(403).json({
      error: `模特照已达上限（${photoCount}/${entitlement.personPhotoLimit}）`,
      personPhotoCount: photoCount,
      personPhotoLimit: entitlement.personPhotoLimit,
      memberLevel: entitlement.memberLevel,
    });
  }
  const file = saveImage(image.data, image.mimeType || "image/jpeg");
  const p = personPhotos.add(req.user.id, file);
  res.json({ item: { id: p.id, imageUrl: imageUrl(p.image_file), createdAt: p.created_at } });
});
app.delete("/api/person-photos/:id", requireAuth, (req, res) => {
  const ok = personPhotos.remove(req.user.id, Number(req.params.id));
  ok ? res.json({ ok: true }) : res.status(404).json({ error: "不存在" });
});

// 衣柜
app.get("/api/wardrobe", requireAuth, (req, res) => {
  const allItems = wardrobe.list(req.user.id);
  const rows = req.query.category ? wardrobe.list(req.user.id, req.query.category) : allItems;
  const entitlement = entitlementsFor(req.user, ENTITLEMENT_LIMITS);
  const items = rows.map((it) => ({
    id: it.id, category: it.category, imageUrl: imageUrl(it.image_file), createdAt: it.created_at, status: it.status || "ready",
  }));
  res.json({
    items,
    count: allItems.length,
    limit: entitlement.wardrobeLimit,
    memberLevel: entitlement.memberLevel,
  });
});
app.post("/api/wardrobe", requireAuth, async (req, res) => {
  const { category, image } = req.body || {};
  if (!ITEM_LABELS[category]) return res.status(400).json({ error: "category 必须为 " + Object.keys(ITEM_LABELS).join("/") });
  if (!image?.data) return res.status(400).json({ error: "缺少图片数据" });
  const entitlement = entitlementsFor(req.user, ENTITLEMENT_LIMITS);
  const wardrobeCount = wardrobe.list(req.user.id).length;
  if (wardrobeCount >= entitlement.wardrobeLimit) {
    return res.status(403).json({
      error: `衣柜已达上限（${wardrobeCount}/${entitlement.wardrobeLimit}）`,
      wardrobeCount,
      wardrobeLimit: entitlement.wardrobeLimit,
      memberLevel: entitlement.memberLevel,
    });
  }
  const file = saveImage(image.data, image.mimeType || "image/jpeg");
  // 先秒回入柜（标记处理中），抠图/AI 识别类别放后台异步执行，避免前端久等
  const needsProcess = (AUTO_CUTOUT || AUTO_CATEGORY);
  const it = wardrobe.add(req.user.id, category, file, needsProcess ? "processing" : "ready");
  res.json({ item: { id: it.id, category: it.category, imageUrl: imageUrl(it.image_file), createdAt: it.created_at, status: it.status } });
  if (needsProcess) enqueueWardrobeItem({ userId: req.user.id, id: it.id, file, fallbackCategory: category });
});
app.get("/api/wardrobe/:id", requireAuth, (req, res) => {
  const it = wardrobe.get(req.user.id, Number(req.params.id));
  if (!it) return res.status(404).json({ error: "不存在" });
  res.json({ item: { id: it.id, category: it.category, imageUrl: imageUrl(it.image_file), createdAt: it.created_at, status: it.status || "ready" } });
});
app.delete("/api/wardrobe/:id", requireAuth, (req, res) => {
  const ok = wardrobe.remove(req.user.id, Number(req.params.id));
  ok ? res.json({ ok: true }) : res.status(404).json({ error: "不存在" });
});

// 今日搭配：结合天气、场景和衣柜图片选择一套完整穿搭。
app.post("/api/today-outfit/recommend", requireAuth, async (req, res) => {
  try {
    const { latitude, longitude, manualWeather, occasion = "daily", force = false } = req.body || {};
    if (!OCCASIONS.has(occasion)) return res.status(400).json({ error: "场景选项无效" });

    let weather;
    let locationBase;
    if (manualWeather) {
      weather = weatherFromPreset(manualWeather);
      if (!weather) return res.status(400).json({ error: "手动天气选项无效" });
      locationBase = `manual:${manualWeather}`;
    } else {
      weather = await fetchCurrentWeather(latitude, longitude);
      locationBase = `geo:${Number(latitude).toFixed(1)},${Number(longitude).toFixed(1)}`;
    }

    const allItems = wardrobe.list(req.user.id).filter((item) => (item.status || "ready") === "ready");
    const requirements = wardrobeRequirements(allItems, weather);
    if (!requirements.complete) {
      return res.status(422).json({
        error: `衣柜还缺少：${requirements.missing.join("、")}，补齐后才能生成完整搭配`,
        missing: requirements.missing,
        wardrobeCount: allItems.length,
      });
    }

    const dateKey = weatherDateKey(weather);
    const weatherBucket = `${weather.condition}:${Math.round(weather.apparentTemperature / 5) * 5}`;
    const locationKey = `${locationBase}:${weatherBucket}`;
    const background = recommendationBackground(weather, occasion);
    const itemJson = (item) => ({
      id: item.id,
      category: item.category,
      imageUrl: imageUrl(item.image_file),
      createdAt: item.created_at,
    });

    const cached = dailyOutfitRecommendations.get(req.user.id, dateKey, occasion, locationKey);
    let previousIds = [];
    if (cached) {
      try { previousIds = JSON.parse(cached.selected_ids_json || "[]"); } catch {}
    }
    if (!force) {
      if (cached) {
        const selected = normalizeSelection(previousIds, allItems, weather);
        if (selected.length >= 3) {
          return res.json({
            date: dateKey,
            occasion,
            occasionLabel: OCCASION_LABELS[occasion],
            weather,
            title: cached.title || "今日推荐",
            reason: cached.reason || "根据当前天气和衣柜搭配",
            generationBackground: cached.background || background,
            items: selected.map(itemJson),
            cached: true,
          });
        }
      }
    }

    const candidates = buildCandidatePool(allItems);
    const recommendation = await selectTodayOutfit(candidates, weather, occasion, force ? previousIds : []);
    const selected = normalizeSelection(recommendation?.selectedIds, candidates, weather);
    const title = String(recommendation?.title || `${weather.conditionLabel}${OCCASION_LABELS[occasion]}穿搭`).slice(0, 20);
    const reason = String(
      recommendation?.reason ||
      `结合${weather.temperature}°C气温、${weather.conditionLabel}天气和${OCCASION_LABELS[occasion]}场景搭配`,
    ).slice(0, 120);
    const scene = String(recommendation?.scene || "").trim().slice(0, 60) || background;
    dailyOutfitRecommendations.save(req.user.id, dateKey, occasion, locationKey, {
      weather,
      selectedIds: selected.map((item) => item.id),
      title,
      reason,
      background: scene,
    });
    res.json({
      date: dateKey,
      occasion,
      occasionLabel: OCCASION_LABELS[occasion],
      weather,
      title,
      reason,
      generationBackground: scene,
      items: selected.map(itemJson),
      cached: false,
    });
  } catch (error) {
    console.error("today outfit error:", error);
    res.status(error.statusCode || 500).json({ error: error.message || "今日搭配生成失败" });
  }
});

// 淘宝/天猫商品链接导入衣柜（第三方聚合 API，仅后端持有 key/secret）
// 解析链接 -> 返回可选商品图；不改动图片，仅供用户挑选
app.post("/api/taobao/resolve", requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "缺少商品链接" });
  try {
    const result = await resolveItem(url);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "解析失败" });
  }
});

// 导入选中的商品图 -> 服务端下载 -> 自动抠图 -> 存入衣柜（复用现有逻辑）
app.post("/api/taobao/import", requireAuth, async (req, res) => {
  const { category, imageUrl: remoteUrl } = req.body || {};
  if (!ITEM_LABELS[category]) return res.status(400).json({ error: "category 必须为 " + Object.keys(ITEM_LABELS).join("/") });
  if (!remoteUrl) return res.status(400).json({ error: "缺少 imageUrl" });
  if (!taobaoConfigured()) return res.status(503).json({ error: "商品链接导入未配置" });
  const entitlement = entitlementsFor(req.user, ENTITLEMENT_LIMITS);
  const wardrobeCount = wardrobe.list(req.user.id).length;
  if (wardrobeCount >= entitlement.wardrobeLimit) {
    return res.status(403).json({
      error: `衣柜已达上限（${wardrobeCount}/${entitlement.wardrobeLimit}）`,
      wardrobeCount,
      wardrobeLimit: entitlement.wardrobeLimit,
      memberLevel: entitlement.memberLevel,
    });
  }
  try {
    const { base64, mimeType } = await downloadImage(remoteUrl);
    let file = saveImage(base64, mimeType);
    const cut = await removeBackground(file).catch(() => null);
    if (cut) file = cut;
    const it = wardrobe.add(req.user.id, category, file);
    res.json({ item: { id: it.id, category: it.category, imageUrl: imageUrl(it.image_file), createdAt: it.created_at, cutout: !!cut } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "导入失败" });
  }
});

// 套装收藏
const parseOutfitItems = (o) => {
  try {
    return JSON.parse(o.items_json || "[]").map((it) => ({ category: it.category, imageUrl: imageUrl(it.image_file) }));
  } catch { return []; }
};
app.get("/api/outfits", requireAuth, (req, res) => {
  const rows = outfits.list(req.user.id);
  const entitlement = entitlementsFor(req.user, ENTITLEMENT_LIMITS);
  const items = rows.map((o) => ({
    id: o.id, name: o.name || null, imageUrl: imageUrl(o.image_file), background: o.background, description: o.description,
    items: parseOutfitItems(o), createdAt: o.created_at,
  }));
  res.json({
    items,
    count: rows.length,
    limit: entitlement.outfitLimit,
    memberLevel: entitlement.memberLevel,
  });
});
app.post("/api/outfits", requireAuth, (req, res) => {
  const { image, generationId, backgroundStyle, description, items, name } = req.body || {};
  const entitlement = entitlementsFor(req.user, ENTITLEMENT_LIMITS);
  const outfitCount = outfits.list(req.user.id).length;
  if (outfitCount >= entitlement.outfitLimit) {
    return res.status(403).json({
      error: `收藏套餐已达上限（${outfitCount}/${entitlement.outfitLimit}）`,
      outfitCount,
      outfitLimit: entitlement.outfitLimit,
      memberLevel: entitlement.memberLevel,
    });
  }
  let file;
  if (generationId) {
    const g = generations.get(req.user.id, Number(generationId));
    if (!g || g.status !== "done" || !g.image_file) return res.status(404).json({ error: "生成记录不存在或未完成" });
    file = copyImage(g.image_file);
  } else {
    let data = image?.data;
    if (typeof data === "string" && data.startsWith("data:")) data = data.split(",")[1];
    if (!data) return res.status(400).json({ error: "缺少图片数据" });
    file = saveImage(data, image.mimeType || "image/png");
  }

  // 生成时用到的单品配件：{ category, data?, mimeType?, wardrobeId? }
  const savedItems = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!ITEM_LABELS[it?.category]) continue;
    let itData = it.data;
    if (typeof itData === "string" && itData.startsWith("data:")) itData = itData.split(",")[1];
    if (itData) {
      savedItems.push({ category: it.category, image_file: saveImage(itData, it.mimeType || "image/jpeg") });
    } else if (it.wardrobeId) {
      const w = wardrobe.get(req.user.id, Number(it.wardrobeId));
      if (w) savedItems.push({ category: it.category, image_file: copyImage(w.image_file) });
    }
  }

  const outfitName = typeof name === "string" ? name.trim().slice(0, 30) : "";
  const o = outfits.add(req.user.id, file, backgroundStyle, description, savedItems.length ? JSON.stringify(savedItems) : null, outfitName || null);
  res.json({ outfit: { id: o.id, name: o.name || null, imageUrl: imageUrl(o.image_file), background: o.background, description: o.description, items: parseOutfitItems(o), createdAt: o.created_at } });
});
const renameOutfit = (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 30) : "";
  const o = outfits.rename(req.user.id, Number(req.params.id), name || null);
  if (!o) return res.status(404).json({ error: "不存在" });
  res.json({ outfit: { id: o.id, name: o.name || null, imageUrl: imageUrl(o.image_file), background: o.background, description: o.description, items: parseOutfitItems(o), createdAt: o.created_at } });
};
app.patch("/api/outfits/:id", requireAuth, renameOutfit);
app.put("/api/outfits/:id", requireAuth, renameOutfit); // wx.request 不支持 PATCH
app.delete("/api/outfits/:id", requireAuth, (req, res) => {
  const ok = outfits.remove(req.user.id, Number(req.params.id));
  ok ? res.json({ ok: true }) : res.status(404).json({ error: "不存在" });
});

const ITEM_LABELS = {
  top: "上衣 (top garment)",
  pants: "裤子 (pants/bottoms)",
  shoes: "鞋子 (shoes)",
  hat: "帽子 (hat/headwear)",
  coat: "外套 (coat/jacket/outerwear, worn over the top garment)",
  dress: "裙装 (skirt/dress)",
  bag: "包包 (bag/handbag/backpack, carried or worn)",
  accessory: "配饰 (accessory: scarf/belt/tie/sunglasses/jewelry)",
  socks: "袜子 (socks)",
};

const BACKGROUND_STYLES = {
  street: "urban street-style scene (city sidewalk, storefronts, natural daylight)",
  studio: "clean professional photo studio with a neutral seamless backdrop and soft studio lighting",
  outdoor: "natural outdoor scene (park, greenery, golden-hour sunlight)",
  cafe: "cozy cafe interior (warm ambient light, coffee bar and wooden furniture softly blurred)",
  beach: "sunny beach scene (sand, ocean waves and blue sky, bright natural light)",
  campus: "university campus scene (classic academic buildings, tree-lined path, daytime)",
  night: "city night scene (neon signs and street lights with soft bokeh)",
  snow: "winter snow scene (snow-covered ground and trees, soft overcast light)",
  home: "stylish home interior (bright living room, large windows, minimalist furniture)",
};

function buildPrompt(itemKeys, hasPerson, backgroundStyle, customBackground) {
  const itemList = itemKeys.map((k, i) => `input_${i + 1}: ${ITEM_LABELS[k]}`).join("; ");
  const custom = typeof customBackground === "string" ? customBackground.trim().slice(0, 200) : "";
  const background = custom || BACKGROUND_STYLES[backgroundStyle] || BACKGROUND_STYLES.studio;
  const personInstruction = hasPerson
    ? `The LAST input image contains the target person/model. ABSOLUTE CRITICAL: preserve the person's facial identity, features, skin tone and expression with ZERO alterations. Retain their exact body pose. DO NOT guess or hallucinate facial features.`
    : `No person image is provided. Generate a photorealistic, full-body fashion model with a natural standing pose suitable for showcasing the outfit.`;

  return `
Task: High-fidelity virtual outfit composition (multi-garment try-on).

Inputs: ${itemList}.
${personInstruction}

Objective: Generate ONE photorealistic, high-resolution, full-body image of the model wearing ALL of the provided clothing items together as a complete outfit.

Core constraints:
1. GARMENT FIDELITY (ABSOLUTE CRITICAL): For every provided item, preserve its EXACT color (hue, saturation, brightness), pattern, texture, material and design details. ZERO deviations. Discard any original model, mannequin or background present in the item images.
2. For any clothing category NOT provided, choose a simple, neutral, non-distracting default (e.g. plain basic garment) so the outfit looks complete and natural.
3. REALISTIC INTEGRATION: Simulate physically plausible draping, folding and fit of every garment on the body. Scale each item correctly to body proportions. Handle occlusion correctly (e.g. top over pants waistband, hat over hair).
4. BACKGROUND: Place the model in a ${background}. The background must be photorealistic and must not distract from the outfit.
5. LIGHTING: Apply consistent lighting, shadows and highlights across the model, all garments and the background.
6. COMPOSITION (ABSOLUTE CRITICAL): Use a vertical 9:16 fashion photograph. Zoom the camera OUT far enough to show the COMPLETE person from the top of the hair to the soles of both shoes. Keep the model centered and no taller than 82% of the image height, with clear empty margin above the hair and below the feet.
7. FACE VISIBILITY (ABSOLUTE CRITICAL): The entire head, hair, forehead, eyes, nose, mouth, chin and neck must be fully inside the frame, naturally lit, unobstructed and clearly visible.

Prohibitions:
- DO NOT alter the intrinsic appearance of any provided garment.
- DO NOT crop the head, hair, forehead, face, chin, hands, legs, shoes or any part of the body.
- DO NOT use a close-up, medium shot, waist-up shot, top-cropped framing or edge-to-edge body framing.
- DO NOT add extra clothing items or accessories that conflict with the provided ones.
- DO NOT produce collage-like or split images; output a single coherent photograph.
`;
}

async function generateWithGemini(prompt, images) {
  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.6,
      topP: 0.95,
      responseModalities: ["Text", "Image"],
    },
  });
  let imageData = null;
  let imageMimeType = "image/png";
  let textResponse = null;
  const candidateParts = response.candidates?.[0]?.content?.parts || [];
  for (const part of candidateParts) {
    if (part.inlineData?.data) {
      imageData = part.inlineData.data;
      imageMimeType = part.inlineData.mimeType || "image/png";
    } else if (part.text) {
      textResponse = part.text;
    }
  }
  if (!imageData) {
    const blockReason = response.promptFeedback?.blockReason;
    const err = new Error(
      blockReason ? `生成被安全策略拦截: ${blockReason}` : "模型未返回图片，请重试"
    );
    err.statusCode = 502;
    err.description = textResponse;
    throw err;
  }
  return { imageData, imageMimeType, textResponse };
}

async function generateWithOpenAI(prompt, images) {
  // OpenAI 兼容的 /v1/images/edits：多张参考图 + 提示词
  const form = new FormData();
  form.append("model", MODEL_ID);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", "1024x1536");
  if (IMAGE_QUALITY) form.append("quality", IMAGE_QUALITY);
  images.forEach((img, i) => {
    const ext = (img.mimeType || "image/jpeg").split("/")[1] || "jpg";
    form.append(
      "image[]",
      new Blob([Buffer.from(img.data, "base64")], { type: img.mimeType }),
      `input_${i + 1}.${ext}`
    );
  });
  const resp = await fetch(`${OPENAI_BASE_URL}/v1/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const raw = (await resp.text()).trim(); // 部分网关会在 JSON 前填充空白字符
  if (!resp.ok) {
    const err = new Error(`生图 API 错误 (HTTP ${resp.status}): ${raw.slice(0, 300)}`);
    err.statusCode = 502;
    throw err;
  }
  const data = JSON.parse(raw);
  const item = data.data?.[0];
  if (item?.b64_json) {
    return { imageData: item.b64_json, imageMimeType: "image/png", textResponse: item.revised_prompt || null };
  }
  if (item?.url) {
    const imgResp = await fetch(item.url);
    const buf = Buffer.from(await imgResp.arrayBuffer());
    return { imageData: buf.toString("base64"), imageMimeType: "image/png", textResponse: null };
  }
  const err = new Error("生图 API 未返回图片数据");
  err.statusCode = 502;
  throw err;
}

async function generateWithArk(prompt, images) {
  // 火山方舟 豆包 Seedream：/images/generations，支持多张参考图（data URL）
  const body = {
    model: MODEL_ID,
    prompt,
    image: images.map((img) => `data:${img.mimeType || "image/jpeg"};base64,${img.data}`),
    response_format: process.env.ARK_RESPONSE_FORMAT || "url",
    size: process.env.ARK_SIZE || "1152x2048",
    stream: false,
    watermark: process.env.ARK_WATERMARK === "1",
  };
  const resp = await fetch(`${ARK_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const raw = (await resp.text()).trim();
  if (!resp.ok) {
    const err = new Error(`生图 API 错误 (HTTP ${resp.status}): ${raw.slice(0, 300)}`);
    err.statusCode = 502;
    throw err;
  }
  const data = JSON.parse(raw);
  const item = data.data?.[0];
  if (item?.b64_json) {
    return { imageData: item.b64_json, imageMimeType: "image/jpeg", textResponse: null };
  }
  if (item?.url) {
    const imgResp = await fetch(item.url);
    const buf = Buffer.from(await imgResp.arrayBuffer());
    return { imageData: buf.toString("base64"), imageMimeType: "image/jpeg", textResponse: null };
  }
  const err = new Error(`生图 API 未返回图片数据: ${raw.slice(0, 300)}`);
  err.statusCode = 502;
  throw err;
}

app.get("/health", (_req, res) => res.json({ ok: true, provider: PROVIDER, model: MODEL_ID }));

async function runProvider(prompt, images) {
  return PROVIDER === "ark"
    ? generateWithArk(prompt, images)
    : PROVIDER === "openai"
      ? generateWithOpenAI(prompt, images)
      : generateWithGemini(prompt, images);
}

// 异步生成任务队列（内存队列，串行消费；失败自动重试 1 次）
const taskQueue = [];
let queueRunning = false;
async function pumpQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (taskQueue.length) {
    const task = taskQueue.shift();
    generations.setStatus(task.id, "processing");
    try {
      let result;
      try {
        result = await runProvider(task.prompt, task.images);
      } catch (e1) {
        console.error(`generation #${task.id} 首次失败，自动重试:`, e1.message);
        result = await runProvider(task.prompt, task.images);
      }
      const file = saveImage(result.imageData, result.imageMimeType);
      generations.finish(task.id, file);
      if (task.charged) credits.consume(task.userId, task.id, CREDITS_PER_GENERATION);
    } catch (err) {
      console.error(`generation #${task.id} 失败:`, err);
      // 详细供应商错误只写服务端日志，客户端统一使用中性提示。
      generations.fail(task.id, "生成失败，请稍后重试");
      if (task.charged) credits.refund(task.userId, task.id, CREDITS_PER_GENERATION);
    }
  }
  queueRunning = false;
}

const generationJson = (g) => ({
  id: g.id,
  status: g.status,
  imageUrl: g.image_file ? imageUrl(g.image_file) : null,
  background: g.background,
  error: g.error || null,
  createdAt: g.created_at,
  finishedAt: g.finished_at,
});

// POST /api/tryon —— 异步：立即返回 taskId，前端轮询 GET /api/tryon/:id
// JSON body: {
//   items: { top?: {data, mimeType} | {wardrobeId}, ... },
//   personImage?: {data, mimeType} | {personPhotoId},
//   backgroundStyle?: "street" | ... | "custom",
//   customBackground?: string
// }
app.post("/api/tryon", requireAuth, (req, res) => {
  try {
    let { items = {}, personImage, backgroundStyle, customBackground } = req.body || {};
    const user = req.user;

    // 额度判定：优先使用当日免费额度，用尽后扣积分
    const entitlement = entitlementsFor(user, ENTITLEMENT_LIMITS);
    const usedFreeToday = generations.countTodayFree(user.id);
    const useFree = usedFreeToday < entitlement.dailyLimit;
    if (!useFree && credits.balance(user.id) < CREDITS_PER_GENERATION) {
      return res.status(402).json({
        error: "生成次数不足，请用兑换码充值后再试",
        ...quotaSnapshot(user),
      });
    }

    // 支持 { personPhotoId } 引用「我的模特照」
    if (personImage && !personImage.data && personImage.personPhotoId) {
      const p = personPhotos.get(user.id, Number(personImage.personPhotoId));
      if (!p) return res.status(404).json({ error: `模特照不存在: ${personImage.personPhotoId}` });
      const buf = fs.readFileSync(path.join(UPLOADS_DIR, p.image_file));
      const ext = path.extname(p.image_file).slice(1) || "png";
      personImage = { data: buf.toString("base64"), mimeType: `image/${ext === "jpg" ? "jpeg" : ext}` };
    }
    // 支持 { wardrobeId } 引用衣柜单品
    for (const k of Object.keys(ITEM_LABELS)) {
      const ref = items[k];
      if (ref && !ref.data && ref.wardrobeId) {
        const it = wardrobe.get(user.id, Number(ref.wardrobeId));
        if (!it) return res.status(404).json({ error: `衣柜单品不存在: ${ref.wardrobeId}` });
        const buf = fs.readFileSync(path.join(UPLOADS_DIR, it.image_file));
        const ext = path.extname(it.image_file).slice(1) || "png";
        items[k] = { data: buf.toString("base64"), mimeType: `image/${ext === "jpg" ? "jpeg" : ext}` };
      }
    }

    const itemKeys = Object.keys(ITEM_LABELS).filter((k) => items[k]?.data);
    if (itemKeys.length === 0) {
      return res.status(400).json({ error: "至少上传一件单品图片" });
    }

    const prompt = buildPrompt(itemKeys, !!personImage?.data, backgroundStyle, backgroundStyle === "custom" ? customBackground : "");
    const images = itemKeys.map((key) => ({
      mimeType: items[key].mimeType || "image/jpeg",
      data: items[key].data,
    }));
    if (personImage?.data) {
      images.push({ mimeType: personImage.mimeType || "image/jpeg", data: personImage.data });
    }

    const g = generations.create(user.id, backgroundStyle || null, useFree ? "free" : "credit");
    let charged = false;
    if (!useFree) {
      const held = credits.hold(user.id, g.id, CREDITS_PER_GENERATION);
      if (!held.ok) {
        // 极端并发下余额被其他请求占用：取消本次任务
        generations.fail(g.id, "积分不足");
        return res.status(402).json({ error: "生成次数不足，请用兑换码充值后再试", ...quotaSnapshot(user) });
      }
      charged = true;
    }
    taskQueue.push({ id: g.id, userId: user.id, prompt, images, charged });
    pumpQueue();
    return res.status(202).json({ taskId: g.id, status: "pending", ...quotaSnapshot(user) });
  } catch (err) {
    console.error("tryon error:", err);
    return res.status(err.statusCode || 500).json({ error: "生成失败", details: err instanceof Error ? err.message : String(err) });
  }
});

// 查询生成任务状态
app.get("/api/tryon/:id", requireAuth, (req, res) => {
  const g = generations.get(req.user.id, Number(req.params.id));
  if (!g) return res.status(404).json({ error: "任务不存在" });
  res.json(generationJson(g));
});

// 生成历史
app.get("/api/history", requireAuth, (req, res) => {
  res.json({ items: generations.list(req.user.id).map(generationJson) });
});
app.delete("/api/history/:id", requireAuth, (req, res) => {
  const ok = generations.remove(req.user.id, Number(req.params.id));
  ok ? res.json({ ok: true }) : res.status(404).json({ error: "不存在" });
});

// 启动时把上次进程遗留的未完成任务标记为失败（内存队列不跨进程）
generations.failStale?.();
credits.refundStale?.(); // 重启后返还中断任务已预扣的积分

app.listen(PORT, () => {
  checkRembg();
  console.log(`AI outfit server listening on http://localhost:${PORT}`);
});
