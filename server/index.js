import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { UPLOADS_DIR, saveImage, copyImage, loginUser, userByToken, wardrobe, outfits, personPhotos, generations } from "./db.js";

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
const ARK_API_KEY = process.env.ARK_API_KEY || "";
const ARK_BASE_URL = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
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
const DAILY_FREE_LIMIT = Number(process.env.DAILY_FREE_LIMIT || 10); // 每用户每日免费生成次数
const AUTO_CUTOUT = process.env.AUTO_CUTOUT !== "0"; // 衣柜上传自动抠图（需安装 rembg）

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
  req.user = user;
  next();
}

const imageUrl = (file) => `/uploads/${file}`;

// 我的信息
app.get("/api/me", requireAuth, (req, res) => {
  const usedToday = generations.countToday(req.user.id);
  res.json({
    userId: req.user.id,
    nickname: req.user.nickname || null,
    createdAt: req.user.created_at,
    devMode: !(WX_APPID && WX_SECRET),
    wardrobeCount: wardrobe.list(req.user.id).length,
    outfitCount: outfits.list(req.user.id).length,
    personPhotoCount: personPhotos.list(req.user.id).length,
    memberLevel: "free", // 会员/充值功能预留
    dailyLimit: DAILY_FREE_LIMIT,
    usedToday,
    remainingToday: Math.max(0, DAILY_FREE_LIMIT - usedToday),
  });
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

// 我的模特照（全身照，可多张）
app.get("/api/person-photos", requireAuth, (req, res) => {
  const items = personPhotos.list(req.user.id).map((p) => ({
    id: p.id, imageUrl: imageUrl(p.image_file), createdAt: p.created_at,
  }));
  res.json({ items });
});
app.post("/api/person-photos", requireAuth, (req, res) => {
  const { image } = req.body || {};
  if (!image?.data) return res.status(400).json({ error: "缺少图片数据" });
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
  const items = wardrobe.list(req.user.id, req.query.category).map((it) => ({
    id: it.id, category: it.category, imageUrl: imageUrl(it.image_file), createdAt: it.created_at,
  }));
  res.json({ items });
});
app.post("/api/wardrobe", requireAuth, async (req, res) => {
  const { category, image } = req.body || {};
  if (!ITEM_LABELS[category]) return res.status(400).json({ error: "category 必须为 " + Object.keys(ITEM_LABELS).join("/") });
  if (!image?.data) return res.status(400).json({ error: "缺少图片数据" });
  let file = saveImage(image.data, image.mimeType || "image/jpeg");
  const cut = await removeBackground(file).catch(() => null);
  if (cut) file = cut;
  const it = wardrobe.add(req.user.id, category, file);
  res.json({ item: { id: it.id, category: it.category, imageUrl: imageUrl(it.image_file), createdAt: it.created_at, cutout: !!cut } });
});
app.delete("/api/wardrobe/:id", requireAuth, (req, res) => {
  const ok = wardrobe.remove(req.user.id, Number(req.params.id));
  ok ? res.json({ ok: true }) : res.status(404).json({ error: "不存在" });
});

// 套装收藏
const parseOutfitItems = (o) => {
  try {
    return JSON.parse(o.items_json || "[]").map((it) => ({ category: it.category, imageUrl: imageUrl(it.image_file) }));
  } catch { return []; }
};
app.get("/api/outfits", requireAuth, (req, res) => {
  const items = outfits.list(req.user.id).map((o) => ({
    id: o.id, name: o.name || null, imageUrl: imageUrl(o.image_file), background: o.background, description: o.description,
    items: parseOutfitItems(o), createdAt: o.created_at,
  }));
  res.json({ items });
});
app.post("/api/outfits", requireAuth, (req, res) => {
  const { image, generationId, backgroundStyle, description, items, name } = req.body || {};
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

Prohibitions:
- DO NOT alter the intrinsic appearance of any provided garment.
- DO NOT crop out the shoes or hat; the full outfit from head to toe must be visible.
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
    size: process.env.ARK_SIZE || "2k",
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
    } catch (err) {
      console.error(`generation #${task.id} 失败:`, err);
      generations.fail(task.id, err instanceof Error ? err.message : String(err));
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

    // 每日免费次数限额
    const usedToday = generations.countToday(user.id);
    if (usedToday >= DAILY_FREE_LIMIT) {
      return res.status(429).json({ error: `今日免费生成次数已用完（${DAILY_FREE_LIMIT} 次/天），请明天再来` });
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

    const g = generations.create(user.id, backgroundStyle || null);
    taskQueue.push({ id: g.id, prompt, images });
    pumpQueue();
    return res.status(202).json({ taskId: g.id, status: "pending", remainingToday: Math.max(0, DAILY_FREE_LIMIT - usedToday - 1) });
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

app.listen(PORT, () => {
  checkRembg();
  console.log(`AI outfit server listening on http://localhost:${PORT}`);
});
