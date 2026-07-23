import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  nickname TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wardrobe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  image_file TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outfits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  image_file TEXT NOT NULL,
  background TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  image_file TEXT,
  background TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS person_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  image_file TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);
try { db.exec("ALTER TABLE outfits ADD COLUMN items_json TEXT"); } catch {}
try { db.exec("ALTER TABLE outfits ADD COLUMN name TEXT"); } catch {}
try { db.exec("ALTER TABLE wardrobe_items ADD COLUMN status TEXT DEFAULT 'ready'"); } catch {}
try { db.exec("ALTER TABLE wardrobe_items ADD COLUMN attrs TEXT"); } catch {}
db.exec(`
CREATE TABLE IF NOT EXISTS wardrobe_upload_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wardrobe_upload_user ON wardrobe_upload_log(user_id, id);
`);
try { db.exec("ALTER TABLE generations ADD COLUMN charge_type TEXT DEFAULT 'free'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN member_level TEXT DEFAULT 'free'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN member_expires_at TEXT"); } catch {}

// 次数/积分系统（不涉及真实支付；用于兑换码、管理员充值，未来可平滑接入微信支付）
db.exec(`
CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS credit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL,
  reference TEXT,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  credits INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS redeem_code_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL REFERENCES redeem_codes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (code_id, user_id)
);
CREATE TABLE IF NOT EXISTS ad_reward_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_outfit_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date_key TEXT NOT NULL,
  occasion TEXT NOT NULL,
  location_key TEXT NOT NULL,
  weather_json TEXT NOT NULL,
  selected_ids_json TEXT NOT NULL,
  title TEXT,
  reason TEXT,
  background TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_id, date_key, occasion, location_key)
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id, id);
CREATE INDEX IF NOT EXISTS idx_ad_reward_user ON ad_reward_sessions(user_id, id);
CREATE INDEX IF NOT EXISTS idx_daily_outfit_user ON daily_outfit_recommendations(user_id, date_key);
`);

export function saveImage(base64, mimeType = "image/png") {
  const ext = (mimeType.split("/")[1] || "png").replace("jpeg", "jpg");
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(base64, "base64"));
  return name;
}

export function copyImage(file) {
  const name = `${crypto.randomUUID()}${path.extname(file)}`;
  fs.copyFileSync(path.join(UPLOADS_DIR, file), path.join(UPLOADS_DIR, name));
  return name;
}

export function deleteImage(name) {
  try { fs.unlinkSync(path.join(UPLOADS_DIR, name)); } catch {}
}

export function loginUser(openid) {
  let user = db.prepare("SELECT * FROM users WHERE openid = ?").get(openid);
  if (!user) {
    const token = crypto.randomBytes(24).toString("hex");
    const info = db.prepare("INSERT INTO users (openid, token) VALUES (?, ?)").run(openid, token);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  }
  return user;
}

export function userByToken(token) {
  if (!token) return null;
  return db.prepare("SELECT * FROM users WHERE token = ?").get(token) || null;
}

export function userById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

export const memberships = {
  set(userId, level, expiresAt = null) {
    const info = db.prepare("UPDATE users SET member_level = ?, member_expires_at = ? WHERE id = ?")
      .run(level, level === "member" ? expiresAt : null, userId);
    return info.changes ? userById(userId) : null;
  },
};

export const wardrobe = {
  list(userId, category) {
    return category
      ? db.prepare("SELECT * FROM wardrobe_items WHERE user_id = ? AND category = ? ORDER BY id DESC").all(userId, category)
      : db.prepare("SELECT * FROM wardrobe_items WHERE user_id = ? ORDER BY id DESC").all(userId);
  },
  add(userId, category, imageFile, status = "ready") {
    const info = db.prepare("INSERT INTO wardrobe_items (user_id, category, image_file, status) VALUES (?, ?, ?, ?)").run(userId, category, imageFile, status);
    return db.prepare("SELECT * FROM wardrobe_items WHERE id = ?").get(info.lastInsertRowid);
  },
  update(userId, id, fields = {}) {
    const cur = this.get(userId, id);
    if (!cur) return null;
    const category = fields.category ?? cur.category;
    const imageFile = fields.imageFile ?? cur.image_file;
    const status = fields.status ?? cur.status;
    const attrs = fields.attrs ?? cur.attrs;
    db.prepare("UPDATE wardrobe_items SET category = ?, image_file = ?, status = ?, attrs = ? WHERE id = ?").run(category, imageFile, status, attrs, id);
    return this.get(userId, id);
  },
  get(userId, id) {
    return db.prepare("SELECT * FROM wardrobe_items WHERE id = ? AND user_id = ?").get(id, userId) || null;
  },
  listMissingAttrs(limit = 500) {
    return db.prepare("SELECT * FROM wardrobe_items WHERE attrs IS NULL AND status = 'ready' ORDER BY id LIMIT ?").all(limit);
  },
  setAttrs(id, attrs) {
    db.prepare("UPDATE wardrobe_items SET attrs = ? WHERE id = ?").run(attrs, id);
  },
  // 上传计数按当天实际上传次数统计，删除衣物不返还，防止反复删传刷 AI 额度
  logUpload(userId) {
    db.prepare("INSERT INTO wardrobe_upload_log (user_id) VALUES (?)").run(userId);
  },
  countUploadsToday(userId) {
    return db.prepare("SELECT COUNT(*) AS c FROM wardrobe_upload_log WHERE user_id = ? AND date(created_at) = date('now')").get(userId).c;
  },
  remove(userId, id) {
    const item = this.get(userId, id);
    if (!item) return false;
    db.prepare("DELETE FROM wardrobe_items WHERE id = ?").run(id);
    deleteImage(item.image_file);
    return true;
  },
};

export const personPhotos = {
  list(userId) {
    return db.prepare("SELECT * FROM person_photos WHERE user_id = ? ORDER BY id DESC").all(userId);
  },
  add(userId, imageFile) {
    const info = db.prepare("INSERT INTO person_photos (user_id, image_file) VALUES (?, ?)").run(userId, imageFile);
    return db.prepare("SELECT * FROM person_photos WHERE id = ?").get(info.lastInsertRowid);
  },
  get(userId, id) {
    return db.prepare("SELECT * FROM person_photos WHERE id = ? AND user_id = ?").get(id, userId) || null;
  },
  remove(userId, id) {
    const item = this.get(userId, id);
    if (!item) return false;
    db.prepare("DELETE FROM person_photos WHERE id = ?").run(id);
    deleteImage(item.image_file);
    return true;
  },
};

export const generations = {
  create(userId, background, chargeType = "free") {
    const info = db.prepare("INSERT INTO generations (user_id, status, background, charge_type) VALUES (?, 'pending', ?, ?)").run(userId, background || null, chargeType);
    this.prune(userId);
    return db.prepare("SELECT * FROM generations WHERE id = ?").get(info.lastInsertRowid);
  },
  // 每个用户最多保留 max 条生成记录，超出时删除最旧的记录及图片
  prune(userId, max = 50) {
    const rows = db.prepare("SELECT id, image_file FROM generations WHERE user_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?").all(userId, max);
    for (const r of rows) {
      db.prepare("DELETE FROM generations WHERE id = ?").run(r.id);
      if (r.image_file) deleteImage(r.image_file);
    }
  },
  setStatus(id, status) {
    db.prepare("UPDATE generations SET status = ? WHERE id = ?").run(status, id);
  },
  finish(id, imageFile) {
    db.prepare("UPDATE generations SET status = 'done', image_file = ?, finished_at = datetime('now') WHERE id = ?").run(imageFile, id);
  },
  fail(id, error) {
    db.prepare("UPDATE generations SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(String(error || "").slice(0, 500), id);
  },
  get(userId, id) {
    return db.prepare("SELECT * FROM generations WHERE id = ? AND user_id = ?").get(id, userId) || null;
  },
  list(userId, limit = 50) {
    return db.prepare("SELECT * FROM generations WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(userId, limit);
  },
  failStale() {
    db.prepare("UPDATE generations SET status = 'failed', error = '服务重启，任务中断', finished_at = datetime('now') WHERE status IN ('pending','processing')").run();
  },
  countToday(userId) {
    return db.prepare("SELECT COUNT(*) AS c FROM generations WHERE user_id = ? AND status != 'failed' AND date(created_at) = date('now')").get(userId).c;
  },
  // 今日已用的「免费额度」生成数（不含积分扣减的生成、不含失败）
  countTodayFree(userId) {
    return db.prepare("SELECT COUNT(*) AS c FROM generations WHERE user_id = ? AND status != 'failed' AND (charge_type = 'free' OR charge_type IS NULL) AND date(created_at) = date('now')").get(userId).c;
  },
  remove(userId, id) {
    const item = this.get(userId, id);
    if (!item) return false;
    db.prepare("DELETE FROM generations WHERE id = ?").run(id);
    if (item.image_file) deleteImage(item.image_file);
    return true;
  },
};

export const outfits = {
  list(userId) {
    return db.prepare("SELECT * FROM outfits WHERE user_id = ? ORDER BY id DESC").all(userId);
  },
  add(userId, imageFile, background, description, itemsJson, name) {
    const info = db.prepare("INSERT INTO outfits (user_id, image_file, background, description, items_json, name) VALUES (?, ?, ?, ?, ?, ?)").run(userId, imageFile, background || null, description || null, itemsJson || null, name || null);
    return db.prepare("SELECT * FROM outfits WHERE id = ?").get(info.lastInsertRowid);
  },
  rename(userId, id, name) {
    const info = db.prepare("UPDATE outfits SET name = ? WHERE id = ? AND user_id = ?").run(name || null, id, userId);
    if (!info.changes) return null;
    return db.prepare("SELECT * FROM outfits WHERE id = ?").get(id);
  },
  remove(userId, id) {
    const item = db.prepare("SELECT * FROM outfits WHERE id = ? AND user_id = ?").get(id, userId);
    if (!item) return false;
    db.prepare("DELETE FROM outfits WHERE id = ?").run(id);
    deleteImage(item.image_file);
    try {
      for (const it of JSON.parse(item.items_json || "[]")) deleteImage(it.image_file);
    } catch {}
    return true;
  },
};

// ============ 次数/积分账户 ============
// 每次生成消耗 1 积分（可配）；不涉及真实支付。
const FREE_SIGNUP_CREDITS = Number(process.env.FREE_SIGNUP_CREDITS || 0); // 默认不额外赠送，免费次数由会员等级控制

function _applyDelta(userId, amount, type, reference, reason) {
  // 需在事务中调用
  const row = db.prepare("SELECT balance FROM credit_accounts WHERE user_id = ?").get(userId);
  const before = row ? row.balance : 0;
  const after = before + amount;
  if (row) {
    db.prepare("UPDATE credit_accounts SET balance = ?, updated_at = datetime('now') WHERE user_id = ?").run(after, userId);
  } else {
    db.prepare("INSERT INTO credit_accounts (user_id, balance) VALUES (?, ?)").run(userId, after);
  }
  db.prepare("INSERT INTO credit_transactions (user_id, amount, balance_after, type, reference, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, amount, after, type, reference != null ? String(reference) : null, reason || null);
  return after;
}

export const credits = {
  // 确保账户存在；首次创建时发放注册赠送积分
  ensureAccount: db.transaction((userId, initial = FREE_SIGNUP_CREDITS) => {
    const row = db.prepare("SELECT balance FROM credit_accounts WHERE user_id = ?").get(userId);
    if (row) return row.balance;
    db.prepare("INSERT INTO credit_accounts (user_id, balance) VALUES (?, 0)").run(userId);
    if (initial > 0) return _applyDelta(userId, initial, "signup_grant", null, "新用户注册赠送");
    return 0;
  }),

  balance(userId) {
    const row = db.prepare("SELECT balance FROM credit_accounts WHERE user_id = ?").get(userId);
    return row ? row.balance : 0;
  },

  // 预扣：余额充足则扣减并记录 hold，返回 { ok, balance }
  hold: db.transaction((userId, reference, amount = 1) => {
    const row = db.prepare("SELECT balance FROM credit_accounts WHERE user_id = ?").get(userId);
    const before = row ? row.balance : 0;
    if (before < amount) return { ok: false, balance: before };
    const after = _applyDelta(userId, -amount, "hold", reference, "生成预扣");
    return { ok: true, balance: after };
  }),

  // 生成成功：把预扣转为消费（余额不变，仅记录，便于审计）
  consume: db.transaction((userId, reference, amount = 1) => {
    const done = db.prepare("SELECT 1 FROM credit_transactions WHERE reference = ? AND type IN ('consume','refund') LIMIT 1").get(String(reference));
    if (done) return; // 幂等：已结算过
    _applyDelta(userId, 0, "consume", reference, "生成成功扣减");
  }),

  // 生成失败：返还预扣的积分（幂等，避免重复返还）
  refund: db.transaction((userId, reference, amount = 1) => {
    const held = db.prepare("SELECT 1 FROM credit_transactions WHERE reference = ? AND type = 'hold' LIMIT 1").get(String(reference));
    if (!held) return { refunded: false, balance: credits.balance(userId) };
    const settled = db.prepare("SELECT 1 FROM credit_transactions WHERE reference = ? AND type IN ('consume','refund') LIMIT 1").get(String(reference));
    if (settled) return { refunded: false, balance: credits.balance(userId) };
    const after = _applyDelta(userId, amount, "refund", reference, "生成失败返还");
    return { refunded: true, balance: after };
  }),

  // 管理员/兑换充值
  grant: db.transaction((userId, amount, type = "admin_adjust", reason = null, reference = null) => {
    return _applyDelta(userId, amount, type, reference, reason);
  }),

  transactions(userId, limit = 50) {
    return db.prepare("SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(userId, limit);
  },

  // 服务重启后：把「已预扣但对应生成已失败/中断且未结算」的积分返还
  refundStale: db.transaction(() => {
    const holds = db.prepare(`
      SELECT ct.user_id, ct.reference, ct.amount
      FROM credit_transactions ct
      JOIN generations g ON g.id = CAST(ct.reference AS INTEGER)
      WHERE ct.type = 'hold' AND g.status = 'failed'
        AND NOT EXISTS (
          SELECT 1 FROM credit_transactions s WHERE s.reference = ct.reference AND s.type IN ('consume','refund')
        )
    `).all();
    for (const h of holds) {
      _applyDelta(h.user_id, -h.amount, "refund", h.reference, "生成中断返还");
    }
    return holds.length;
  }),
};

export const adRewards = {
  countToday(userId) {
    return db.prepare(`
      SELECT COUNT(*) AS c
      FROM ad_reward_sessions
      WHERE user_id = ? AND status = 'claimed' AND date(claimed_at) = date('now')
    `).get(userId).c;
  },

  createSession: db.transaction((userId, dailyLimit = 1) => {
    const usedToday = adRewards.countToday(userId);
    if (usedToday >= dailyLimit) {
      return { ok: false, error: "今日广告奖励已领取", usedToday };
    }
    db.prepare(`
      DELETE FROM ad_reward_sessions
      WHERE user_id = ? AND status = 'pending' AND expires_at <= datetime('now')
    `).run(userId);
    const token = crypto.randomBytes(24).toString("hex");
    const info = db.prepare(`
      INSERT INTO ad_reward_sessions (user_id, token, expires_at)
      VALUES (?, ?, datetime('now', '+10 minutes'))
    `).run(userId, token);
    const row = db.prepare("SELECT * FROM ad_reward_sessions WHERE id = ?").get(info.lastInsertRowid);
    return { ok: true, token: row.token, expiresAt: row.expires_at, usedToday };
  }),

  claim: db.transaction((userId, token, dailyLimit = 1, rewardCredits = 1) => {
    const session = db.prepare(`
      SELECT *,
        expires_at > datetime('now') AS is_valid,
        created_at <= datetime('now', '-5 seconds') AS is_mature
      FROM ad_reward_sessions
      WHERE token = ? AND user_id = ?
    `).get(token, userId);
    if (!session) return { ok: false, error: "广告奖励凭证无效" };
    if (session.status !== "pending") return { ok: false, error: "该广告奖励已领取" };
    if (!session.is_valid) return { ok: false, error: "广告奖励凭证已过期" };
    if (!session.is_mature) return { ok: false, error: "广告尚未完成" };
    const usedToday = adRewards.countToday(userId);
    if (usedToday >= dailyLimit) return { ok: false, error: "今日广告奖励已领取" };

    const updated = db.prepare(`
      UPDATE ad_reward_sessions
      SET status = 'claimed', claimed_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(session.id);
    if (!updated.changes) return { ok: false, error: "该广告奖励已领取" };
    const balance = _applyDelta(userId, rewardCredits, "ad_reward", `ad:${session.id}`, "完整观看激励广告");
    return { ok: true, credits: rewardCredits, balance, usedToday: usedToday + 1 };
  }),
};

export const dailyOutfitRecommendations = {
  get(userId, dateKey, occasion, locationKey) {
    return db.prepare(`
      SELECT * FROM daily_outfit_recommendations
      WHERE user_id = ? AND date_key = ? AND occasion = ? AND location_key = ?
    `).get(userId, dateKey, occasion, locationKey) || null;
  },

  save: db.transaction((userId, dateKey, occasion, locationKey, data) => {
    db.prepare(`
      INSERT INTO daily_outfit_recommendations (
        user_id, date_key, occasion, location_key, weather_json,
        selected_ids_json, title, reason, background
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date_key, occasion, location_key) DO UPDATE SET
        weather_json = excluded.weather_json,
        selected_ids_json = excluded.selected_ids_json,
        title = excluded.title,
        reason = excluded.reason,
        background = excluded.background,
        updated_at = datetime('now')
    `).run(
      userId,
      dateKey,
      occasion,
      locationKey,
      JSON.stringify(data.weather),
      JSON.stringify(data.selectedIds),
      data.title || null,
      data.reason || null,
      data.background || null,
    );
    return dailyOutfitRecommendations.get(userId, dateKey, occasion, locationKey);
  }),
};

export const redeemCodes = {
  create(code, creditsAmount, maxUses = 1, expiresAt = null, reason = null) {
    const info = db.prepare("INSERT INTO redeem_codes (code, credits, max_uses, expires_at, reason) VALUES (?, ?, ?, ?, ?)")
      .run(code, creditsAmount, maxUses, expiresAt, reason);
    return db.prepare("SELECT * FROM redeem_codes WHERE id = ?").get(info.lastInsertRowid);
  },

  // 兑换：事务内校验并加积分。返回 { ok, error?, credits?, remainingCredits? }
  redeem: db.transaction((userId, code) => {
    const rc = db.prepare("SELECT * FROM redeem_codes WHERE code = ?").get(code);
    if (!rc) return { ok: false, error: "兑换码无效" };
    if (rc.status !== "active") return { ok: false, error: "兑换码已失效" };
    if (rc.expires_at && rc.expires_at < new Date().toISOString()) return { ok: false, error: "兑换码已过期" };
    if (rc.used_count >= rc.max_uses) return { ok: false, error: "兑换码已被使用" };
    const used = db.prepare("SELECT 1 FROM redeem_code_uses WHERE code_id = ? AND user_id = ?").get(rc.id, userId);
    if (used) return { ok: false, error: "你已使用过该兑换码" };
    db.prepare("INSERT INTO redeem_code_uses (code_id, user_id) VALUES (?, ?)").run(rc.id, userId);
    const usedCount = rc.used_count + 1;
    db.prepare("UPDATE redeem_codes SET used_count = ?, status = ? WHERE id = ?")
      .run(usedCount, usedCount >= rc.max_uses ? "used" : "active", rc.id);
    const after = _applyDelta(userId, rc.credits, "redeem", `code:${rc.id}`, `兑换码 ${rc.code}`);
    return { ok: true, credits: rc.credits, remainingCredits: after };
  }),
};
