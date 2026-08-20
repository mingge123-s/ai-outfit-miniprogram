import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadWxApps, exchangeWxCode } from "./wechat-login.js";

describe("loadWxApps", () => {
  it("returns empty when credentials are missing", () => {
    assert.deepEqual(loadWxApps({}), []);
  });

  it("loads primary and secondary mini programs", () => {
    assert.deepEqual(
      loadWxApps({
        WX_APPID: "wx_old",
        WX_SECRET: "old_secret",
        WX_APPID_2: "wx_new",
        WX_SECRET_2: "new_secret"
      }),
      [
        { appid: "wx_old", secret: "old_secret" },
        { appid: "wx_new", secret: "new_secret" }
      ]
    );
  });
});

describe("exchangeWxCode", () => {
  it("uses development openid when no wechat apps are configured", async () => {
    const result = await exchangeWxCode("abc", []);
    assert.deepEqual(result, { openid: "dev_abc", appid: null });
  });

  it("tries the next appid when the first code2session fails", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes("appid=wx_old")) {
        return { json: async () => ({ errcode: 40029, errmsg: "invalid code" }) };
      }
      return { json: async () => ({ openid: "oNEW" }) };
    };
    const result = await exchangeWxCode("code123", [
      { appid: "wx_old", secret: "old_secret" },
      { appid: "wx_new", secret: "new_secret" }
    ], fetchImpl);
    assert.deepEqual(result, { openid: "oNEW", appid: "wx_new" });
    assert.equal(calls.length, 2);
  });

  it("throws when no appid accepts the code", async () => {
    const fetchImpl = async () => ({ json: async () => ({ errcode: 40029, errmsg: "invalid code" }) });
    await assert.rejects(
      () => exchangeWxCode("bad", [{ appid: "wx_old", secret: "old_secret" }], fetchImpl),
      (err) => err.statusCode === 401 && err.message === "invalid code"
    );
  });
});
