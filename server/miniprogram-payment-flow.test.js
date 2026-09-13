import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const app = {};
let pageDefinition;
globalThis.getApp = () => app;
globalThis.Page = (definition) => { pageDefinition = definition; };
const api = require("../miniprogram/utils/api.js");
require("../miniprogram/pages/me/me.js");

function paymentOrder() {
  return {
    orderNo: "ORDER-1",
    payment: { timeStamp: "1", nonceStr: "nonce", package: "prepay_id=real", signType: "RSA", paySign: "signed" }
  };
}

async function withPaymentWx(run) {
  const previousWx = globalThis.wx;
  const originalQuery = api.pay.queryOrder;
  const originalCreate = api.pay.createMemberOrder;
  const events = [];
  globalThis.wx = {
    showLoading: () => events.push("loading"),
    hideLoading: () => events.push("hideLoading"),
    showToast: (options) => events.push({ toast: options.title }),
    showModal: (options) => events.push({ modal: options.title }),
    requestPayment: (options) => options.success()
  };
  const page = { ...pageDefinition, data: {}, refresh: async () => events.push("refresh") };
  try {
    await run({ page, events });
  } finally {
    globalThis.wx = previousWx;
    api.pay.queryOrder = originalQuery;
    api.pay.createMemberOrder = originalCreate;
  }
}

describe("mini program membership payment feedback", () => {
  it("shows opened only after the server confirms paid", async () => {
    await withPaymentWx(async ({ page, events }) => {
      api.pay.queryOrder = async () => ({ status: "paid" });
      await page.requestPayment(paymentOrder());
      assert.ok(events.some((event) => event.toast === "会员已开通"));
      assert.ok(!events.some((event) => event.modal === "支付结果待确认"));
    });
  });

  it("does not claim membership when the server still says paying", async () => {
    await withPaymentWx(async ({ page, events }) => {
      api.pay.queryOrder = async () => ({ status: "paying" });
      await page.requestPayment(paymentOrder());
      assert.ok(events.some((event) => event.modal === "支付结果待确认"));
      assert.ok(!events.some((event) => event.toast === "会员已开通"));
    });
  });

  it("does not claim membership on cancelled or unavailable status", async () => {
    await withPaymentWx(async ({ page, events }) => {
      api.pay.queryOrder = async () => ({ status: "cancelled" });
      await page.requestPayment(paymentOrder());
      assert.ok(events.some((event) => event.toast === "订单已取消"));
      assert.ok(!events.some((event) => event.toast === "会员已开通"));
    });
    await withPaymentWx(async ({ page, events }) => {
      api.pay.queryOrder = async () => { throw new Error("network"); };
      await page.requestPayment(paymentOrder());
      assert.ok(events.some((event) => event.modal === "支付结果待确认"));
      assert.ok(!events.some((event) => event.toast === "会员已开通"));
    });
  });

  it("separates order failure, payment failure, and payment cancellation", async () => {
    await withPaymentWx(async ({ page, events }) => {
      api.pay.createMemberOrder = async () => { throw new Error("prepay failed"); };
      await page.payForPlan({ id: "monthly" });
      assert.ok(events.some((event) => event.modal === "下单失败"));
    });
    await withPaymentWx(async ({ page, events }) => {
      api.pay.createMemberOrder = async () => paymentOrder();
      page.requestPayment = async () => { throw new Error("payment failed"); };
      await page.payForPlan({ id: "monthly" });
      assert.ok(events.some((event) => event.modal === "支付失败"));
      assert.ok(!events.some((event) => event.modal === "下单失败"));
    });
    await withPaymentWx(async ({ page, events }) => {
      api.pay.createMemberOrder = async () => paymentOrder();
      page.requestPayment = async () => { const error = new Error("cancelled"); error.paymentCancelled = true; throw error; };
      await page.payForPlan({ id: "monthly" });
      assert.ok(events.some((event) => event.toast === "已取消支付"));
      assert.ok(!events.some((event) => event.modal === "下单失败" || event.modal === "支付失败"));
    });
  });

  it("marks only an actual WeChat cancellation as cancelled", async () => {
    await withPaymentWx(async ({ page }) => {
      globalThis.wx.requestPayment = (options) => options.fail({ errMsg: "requestPayment:fail cancel" });
      await assert.rejects(() => page.requestPayment(paymentOrder()), (error) => error.paymentCancelled === true);
      globalThis.wx.requestPayment = (options) => options.fail({ errMsg: "requestPayment:fail" });
      await assert.rejects(() => page.requestPayment(paymentOrder()), (error) => error.paymentCancelled !== true);
    });
  });
});
