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
CREATE TABLE IF NOT EXISTS person_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  image_file TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);
try { db.exec("ALTER TABLE outfits ADD COLUMN items_json TEXT"); } catch {}
try { db.exec("ALTER TABLE outfits ADD COLUMN name TEXT"); } catch {}

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

export const wardrobe = {
  list(userId, category) {
    return category
      ? db.prepare("SELECT * FROM wardrobe_items WHERE user_id = ? AND category = ? ORDER BY id DESC").all(userId, category)
      : db.prepare("SELECT * FROM wardrobe_items WHERE user_id = ? ORDER BY id DESC").all(userId);
  },
  add(userId, category, imageFile) {
    const info = db.prepare("INSERT INTO wardrobe_items (user_id, category, image_file) VALUES (?, ?, ?)").run(userId, category, imageFile);
    return db.prepare("SELECT * FROM wardrobe_items WHERE id = ?").get(info.lastInsertRowid);
  },
  get(userId, id) {
    return db.prepare("SELECT * FROM wardrobe_items WHERE id = ? AND user_id = ?").get(id, userId) || null;
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
