import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowedPayAppids, resolvePayAppid } from "./wechatpay-appid.js";

describe("pay appid", () => {
  const env = {
    WXPAY_APPID: "wx_old",
    WX_APPID: "wx_old",
    WX_APPID_2: "wx_new"
  };

  it("lists old and new mini programs", () => {
    assert.deepEqual(allowedPayAppids(env), ["wx_old", "wx_new"]);
  });

  it("uses the requested appid when it is allowed", () => {
    assert.equal(resolvePayAppid("wx_new", env), "wx_new");
  });

  it("falls back to the merchant default for unknown appids", () => {
    assert.equal(resolvePayAppid("wx_unknown", env), "wx_old");
    assert.equal(resolvePayAppid("", env), "wx_old");
  });
});
