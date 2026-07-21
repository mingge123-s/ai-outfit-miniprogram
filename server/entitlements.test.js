import test from "node:test";
import assert from "node:assert/strict";
import { effectiveMemberLevel, entitlementsFor } from "./entitlements.js";

const limits = {
  freeDailyLimit: 3,
  memberDailyLimit: 10,
  freeWardrobeLimit: 10,
  memberWardrobeLimit: 30,
};

test("free users receive free limits", () => {
  assert.deepEqual(entitlementsFor({ member_level: "free" }, limits), {
    memberLevel: "free",
    memberExpiresAt: null,
    dailyLimit: 3,
    wardrobeLimit: 10,
  });
});

test("permanent members receive member limits", () => {
  assert.deepEqual(entitlementsFor({ member_level: "member", member_expires_at: null }, limits), {
    memberLevel: "member",
    memberExpiresAt: null,
    dailyLimit: 10,
    wardrobeLimit: 30,
  });
});

test("expired memberships fall back to free", () => {
  const user = { member_level: "member", member_expires_at: "2026-01-01T00:00:00.000Z" };
  assert.equal(effectiveMemberLevel(user, Date.parse("2026-02-01T00:00:00.000Z")), "free");
  assert.equal(entitlementsFor(user, limits, Date.parse("2026-02-01T00:00:00.000Z")).dailyLimit, 3);
});

test("active SQLite-style expiry remains a member", () => {
  const user = { member_level: "member", member_expires_at: "2026-12-31 23:59:59" };
  assert.equal(effectiveMemberLevel(user, Date.parse("2026-07-21T00:00:00.000Z")), "member");
});
