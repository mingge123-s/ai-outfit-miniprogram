import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 用临时数据库测试 payOrders 存储（把 DATA_DIR 指向临时目录）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paytest-"));
process.env.DATA_DIR_OVERRIDE = tmp;

const dbMod = await import(`./db.js?paytest=${Date.now()}`);
const { payOrders, loginUser } = dbMod;
const userA = loginUser("dev_user_a");
const userB = loginUser("dev_user_b");

test("create/query order roundtrip", () => {
  const ot = payOrders.create(userA.id, "TEST1001", "monthly", 990, "openid-x");
  assert.equal(ot.user_id, userA.id);
  assert.equal(ot.status, "pending");
  assert.equal(payOrders.getByOrderNo("TEST1001").amount_fen, 990);
  assert.equal(payOrders.getForUser(userA.id, "TEST1001").plan_id, "monthly");
});

test("setPrepay transitions pending -> paying and keeps prepay_id", () => {
  payOrders.setPrepay("TEST1001", "prepay_abc");
  const o = payOrders.getByOrderNo("TEST1001");
  assert.equal(o.status, "paying");
  assert.equal(o.prepay_id, "prepay_abc");
});

test("markPaid is idempotent", () => {
  assert.equal(payOrders.markPaid("TEST1001", "txn-01", "{}"), true);
  assert.equal(payOrders.markPaid("TEST1001", "txn-01-dup", "{}"), false);
  assert.equal(payOrders.getByOrderNo("TEST1001").status, "paid");
  assert.equal(payOrders.getByOrderNo("TEST1001").transaction_id, "txn-01");
  assert.equal(payOrders.isPaid("TEST1001"), true);
});

test("listForUser filters by owner", () => {
  payOrders.create(userB.id, "TEST1002", "yearly", 9900, "openid-y");
  const theirs = payOrders.listForUser(userA.id).map((o) => o.order_no);
  assert.ok(theirs.includes("TEST1001"));
  assert.ok(!theirs.includes("TEST1002"));
});