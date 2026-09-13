import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSuccessfulPayment } from "./payment-validation.js";

describe("paid membership order validation", () => {
  const order = { order_no: "ORDER-1", amount_fen: 990, openid: "openid-1" };
  const paid = {
    trade_state: "SUCCESS", out_trade_no: "ORDER-1", amount: { total: 990 },
    transaction_id: "TX-1", mchid: "merchant-1", payer: { openid: "openid-1" }
  };

  it("accepts a fully matching successful transaction", () => {
    assert.equal(validateSuccessfulPayment(order, paid, "merchant-1"), true);
  });

  it("rejects a different or missing merchant order number", () => {
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, out_trade_no: "ORDER-2" }), /订单号不匹配/);
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, out_trade_no: "" }), /订单号不匹配/);
  });

  it("rejects the wrong or missing amount before entitlements can be granted", () => {
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, amount: { total: 1 } }), /金额不匹配/);
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, amount: {} }), /金额不匹配/);
  });

  it("rejects unconfirmed payments and missing transaction IDs", () => {
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, trade_state: "NOTPAY" }), /状态未确认/);
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, transaction_id: "" }), /缺少微信支付交易号/);
  });

  it("checks merchant and payer identities when supplied by WeChat", () => {
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, mchid: "merchant-2" }, "merchant-1"), /商户号不匹配/);
    assert.throws(() => validateSuccessfulPayment(order, { ...paid, payer: { openid: "openid-2" } }), /付款用户不匹配/);
  });
});
