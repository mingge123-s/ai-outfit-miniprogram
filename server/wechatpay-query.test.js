import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMemberPrepay, queryOrder } from "./wechatpay.js";

const keys = ["WXPAY_APPID", "WX_APPID", "WX_APPID_2"];

async function withAppids(run) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.WXPAY_APPID = "wx_old";
  process.env.WX_APPID = "wx_old";
  process.env.WX_APPID_2 = "wx_new";
  try {
    await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

describe("WeChat payment order lookup", () => {
  it("queries with the new mini program client and installed SDK method", async () => {
    await withAppids(async () => {
      const calls = [];
      const fakeClient = (appid) => {
        calls.push({ appid });
        return {
          query: async (params) => {
            calls.push({ params });
            return { status: 200, data: { trade_state: "SUCCESS" } };
          }
        };
      };
      const result = await queryOrder("ORDER-NEW", "wx_new", fakeClient);
      assert.deepEqual(calls, [
        { appid: "wx_new" },
        { params: { out_trade_no: "ORDER-NEW" } }
      ]);
      assert.deepEqual(result, { trade_state: "SUCCESS" });
    });
  });

  it("keeps the old mini program and rejects unknown client AppIDs by falling back", async () => {
    await withAppids(async () => {
      const appids = [];
      const fakeClient = (appid) => {
        appids.push(appid);
        return { query: async () => ({ status: 200, data: { trade_state: "NOTPAY" } }) };
      };
      await queryOrder("ORDER-OLD", "wx_old", fakeClient);
      await queryOrder("ORDER-UNKNOWN", "wx_other", fakeClient);
      assert.deepEqual(appids, ["wx_old", "wx_old"]);
    });
  });

  it("reports a failed lookup without pretending the order was paid", async () => {
    await withAppids(async () => {
      await assert.rejects(
        () => queryOrder("ORDER-ERROR", "wx_new", () => ({
          query: async () => ({ status: 404, data: { message: "订单不存在" } })
        })),
        /查询订单失败：订单不存在/
      );
    });
  });
});

describe("WeChat membership prepay", () => {
  const order = {
    orderNo: "ORDER-NEW", amountFen: 990, description: "会员月卡", openid: "openid-new", appid: "wx_new"
  };

  it("uses the payment parameters returned by the installed SDK", async () => {
    await withAppids(async () => {
      const calls = [];
      const payment = await createMemberPrepay(order, (appid) => {
        calls.push({ appid });
        return {
          transactions_jsapi: async (params) => {
            calls.push({ params });
            return {
              status: 200,
              data: {
                appId: "wx_new", timeStamp: "123", nonceStr: "nonce", package: "prepay_id=real-id",
                signType: "RSA", paySign: "signed"
              }
            };
          }
        };
      });
      assert.equal(calls[0].appid, "wx_new");
      assert.deepEqual(calls[1].params, {
        description: "会员月卡", out_trade_no: "ORDER-NEW", notify_url: "",
        amount: { total: 990, currency: "CNY" }, payer: { openid: "openid-new" }
      });
      assert.deepEqual(payment, {
        timeStamp: "123", nonceStr: "nonce", package: "prepay_id=real-id",
        signType: "RSA", paySign: "signed"
      });
    });
  });

  it("can sign a raw prepay_id for a client that does not transform it", async () => {
    await withAppids(async () => {
      const payment = await createMemberPrepay(order, () => ({
        transactions_jsapi: async () => ({ status: 200, data: { prepay_id: "raw-id" } }),
        sha256WithRsa: (message) => {
          assert.match(message, /^wx_new\n/);
          return "signed-raw";
        }
      }));
      assert.equal(payment.package, "prepay_id=raw-id");
      assert.equal(payment.paySign, "signed-raw");
    });
  });

  it("never sends prepay_id=undefined and keeps WeChat's error code", async () => {
    await withAppids(async () => {
      await assert.rejects(
        () => createMemberPrepay(order, () => ({
          transactions_jsapi: async () => ({ status: 200, data: {} })
        })),
        /缺少支付参数/
      );
      await assert.rejects(
        () => createMemberPrepay(order, () => ({
          transactions_jsapi: async () => ({
            status: 403, error: '{"code":"APPID_MCHID_NOT_MATCH","message":"商户号与 AppID 不匹配"}'
          })
        })),
        /APPID_MCHID_NOT_MATCH：商户号与 AppID 不匹配/
      );
    });
  });
});
