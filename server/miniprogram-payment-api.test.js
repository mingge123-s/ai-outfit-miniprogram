import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const api = require("../miniprogram/utils/api.js");

describe("mini program payment API", () => {
  async function withWx(accountInfo, run) {
    const oldWx = globalThis.wx;
    const requests = [];
    globalThis.wx = {
      getStorageSync: () => "test-token",
      getAccountInfoSync: accountInfo,
      request(options) {
        requests.push(options);
        options.success({ statusCode: 200, data: { ok: true } });
      }
    };
    try {
      await run(requests);
    } finally {
      globalThis.wx = oldWx;
    }
  }

  it("sends the current AppID for new-program prepay and lookup", async () => {
    await withWx(() => ({ miniProgram: { appId: "wx_new" } }), async (requests) => {
      await api.pay.createMemberOrder("monthly");
      await api.pay.queryOrder("ORDER-NEW");
      assert.deepEqual(requests[0].data, { planId: "monthly", appId: "wx_new" });
      assert.match(requests[1].url, /\/api\/pay\/order\/ORDER-NEW\?appId=wx_new$/);
    });
  });

  it("supports old SDKs without getAccountInfoSync", async () => {
    await withWx(() => { throw new Error("unsupported"); }, async (requests) => {
      await api.pay.createMemberOrder("yearly");
      await api.pay.queryOrder("ORDER-OLD");
      assert.deepEqual(requests[0].data, { planId: "yearly", appId: "" });
      assert.match(requests[1].url, /\/api\/pay\/order\/ORDER-OLD$/);
    });
  });
});
