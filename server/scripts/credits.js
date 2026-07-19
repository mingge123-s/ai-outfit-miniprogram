// 管理员积分/兑换码 CLI（本地/服务器直接运行，不涉及真实支付）
//   node server/scripts/credits.js balance <userId>
//   node server/scripts/credits.js grant <userId> <amount> [原因]
//   node server/scripts/credits.js gen-code <credits> [数量=1] [每码可用次数=1]
//   node server/scripts/credits.js list-codes
import { credits, redeemCodes } from "../db.js";

const [cmd, ...args] = process.argv.slice(2);

function usage() {
  console.log(`用法:
  node server/scripts/credits.js balance <userId>
  node server/scripts/credits.js grant <userId> <amount> [原因]
  node server/scripts/credits.js gen-code <credits> [数量=1] [每码可用次数=1]
  node server/scripts/credits.js list-codes`);
}

if (cmd === "balance") {
  const uid = Number(args[0]);
  if (!uid) { usage(); process.exit(1); }
  credits.ensureAccount(uid, 0);
  console.log(`用户 #${uid} 余额: ${credits.balance(uid)} 积分`);
} else if (cmd === "grant") {
  const uid = Number(args[0]);
  const amt = Number(args[1]);
  if (!uid || !Number.isInteger(amt) || amt === 0) { usage(); process.exit(1); }
  credits.ensureAccount(uid, 0);
  const bal = credits.grant(uid, amt, "admin_adjust", args.slice(2).join(" ") || "CLI 充值");
  console.log(`用户 #${uid} ${amt > 0 ? "充值" : "扣减"} ${Math.abs(amt)}，当前余额: ${bal}`);
} else if (cmd === "gen-code") {
  const amt = Number(args[0]);
  const count = Math.min(Math.max(1, Number(args[1]) || 1), 500);
  const maxUses = Number(args[2]) || 1;
  if (!Number.isInteger(amt) || amt <= 0) { usage(); process.exit(1); }
  for (let i = 0; i < count; i++) {
    let created = false;
    for (let t = 0; t < 5 && !created; t++) {
      const code = "WF" + Math.random().toString(36).slice(2, 10).toUpperCase();
      try { redeemCodes.create(code, amt, maxUses); console.log(`${code}  (+${amt} 次, 可用 ${maxUses} 次)`); created = true; } catch {}
    }
  }
} else if (cmd === "list-codes") {
  const { default: Database } = await import("better-sqlite3");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const db = new Database(path.join(__dirname, "..", "data", "app.db"), { readonly: true });
  for (const r of db.prepare("SELECT code, credits, used_count, max_uses, status FROM redeem_codes ORDER BY id DESC LIMIT 100").all()) {
    console.log(`${r.code}\t+${r.credits}\t${r.used_count}/${r.max_uses}\t${r.status}`);
  }
} else {
  usage();
}
