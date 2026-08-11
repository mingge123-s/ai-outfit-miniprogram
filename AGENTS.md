# AGENTS.md

## Cursor Cloud specific instructions

This repo has two parts:

- `server/` — Node.js (Express, ESM) backend. SQLite (`better-sqlite3`) stores accounts/wardrobe/outfits/credits under `server/data/` (gitignored). This is the only part runnable in the cloud VM.
- `miniprogram/` — native WeChat mini program. It requires WeChat DevTools (Windows/macOS GUI only) and cannot be built or run in this Linux VM. Do not attempt to run it here; verify backend behavior instead.

### Running the backend (dev)

- Start with `npm run dev` in `server/` (uses `node --watch`, hot reload). Default port `3000`. Standard commands are in `server/package.json`.
- A `.env` is optional. With no `WX_APPID`/`WX_SECRET`, login runs in dev mode: `POST /api/login {"code":"anything"}` returns a token immediately (openid becomes `dev_<code>`), so no WeChat account is needed for local testing.
- There are no lint or automated test scripts defined in this repo.

### Non-obvious caveats

- AI image generation (`POST /api/tryon`) needs an external provider key (`ARK_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`) in `server/.env`. Without a key the server still boots (logs a "Missing ... API_KEY" warning) and every non-generation endpoint works; only actual try-on generation fails at the provider call. Provide a key as a secret to exercise generation end-to-end.
- Everything except generation works with zero keys: dev login, wardrobe/person-photo upload, outfits, credits/redeem, history. New users get `FREE_SIGNUP_CREDITS` (3) credits and `DAILY_FREE_LIMIT` (10) free generations/day.
- Wardrobe uploads return immediately with `status:"processing"`, then a background task sets `status:"ready"`. Auto-cutout needs `rembg` (Python CLI, not installed by default) and auto-category needs `VISION_API_KEY`; both silently fall back to the original image / user-chosen category when unavailable.
- Browser test UI: open `http://localhost:3000/test.html` (served from `server/public/`, same-origin relative fetches). It auto-runs dev login on load — a quick way to exercise the whole flow without WeChat DevTools.
- Taobao/Tmall import stays disabled unless the `taobao.js` third-party API credentials are configured.
- `miniprogram/config.js` points at the production backend (`https://api.mingge.asia/outfit`); switch it to `http://localhost:3000` only when debugging the mini program against a local server.
