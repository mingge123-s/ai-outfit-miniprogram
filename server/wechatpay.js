import fs from "node:fs";
import crypto from "node:crypto";
import WeChatPay from "wechatpay-node-v3";
import { resolvePayAppid } from "./wechatpay-appid.js";

export { allowedPayAppids, resolvePayAppid } from "./wechatpay-appid.js";

const MCHID = process.env.WXPAY_MCHID || "";
const APIV3_KEY = process.env.WXPAY_APIV3_KEY || "";
const SERIAL_NO = process.env.WXPAY_SERIAL_NO || "";
const PRIVATE_KEY_PATH = process.env.WXPAY_PRIVATE_KEY_PATH || "";
const CERT_PATH = process.env.WXPAY_CERT_PATH || process.env.WXPAY_PRIVATE_KEY_PATH || "";
const APPID = process.env.WXPAY_APPID || process.env.WX_APPID || "";
const NOTIFY_URL = process.env.WXPAY_NOTIFY_URL || "";

export const wxpayEnabled = Boolean(
  MCHID && APIV3_KEY && SERIAL_NO && fs.existsSync(PRIVATE_KEY_PATH) && APPID && NOTIFY_URL
);

const clients = new Map();

function client(appid = APPID) {
  if (!wxpayEnabled) return null;
  const id = appid || APPID;
  if (!clients.has(id)) {
    clients.set(id, new WeChatPay({
      appid: id,
      mchid: MCHID,
      serial_no: SERIAL_NO,
      publicKey: fs.readFileSync(CERT_PATH),
      privateKey: fs.readFileSync(PRIVATE_KEY_PATH),
      key: APIV3_KEY,
    }));
  }
  return clients.get(id);
}

// 生成唯一的商户订单号：时间戳 + 随机后缀（<=32 位，满足微信 out_trade_no 约束）
export function newOrderNo() {
  return `${Date.now()}${crypto.randomBytes(4).toString("hex")}`;
}

// 发起小程序 JSAPI 下单，返回 wx.requestPayment 所需参数
export async function createMemberPrepay({ orderNo, amountFen, description, openid, appid }) {
  const payAppid = resolvePayAppid(appid);
  const c = client(payAppid);
  if (!c) throw new Error("微信支付未配置");
  const res = await c.transactions_jsapi({
    description,
    out_trade_no: orderNo,
    notify_url: NOTIFY_URL,
    amount: { total: amountFen, currency: "CNY" },
    payer: { openid },
  });
  if (res.status === 200 || res.status === 201) {
    const prepayId = res.data.prepay_id;
    return buildPaymentParams(prepayId, payAppid);
  }
  const detail = (res.data && (res.data.message || res.data.code)) || res.error || res.errRaw;
  throw new Error(`微信下单失败：${detail}`);
}

// 用 prepay_id 构造小程序拉起收银台所需参数（PaySign 使用商户私钥 RSA 加签）
function buildPaymentParams(prepayId, appid = APPID) {
  const c = client(appid);
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = crypto.randomBytes(16).toString("hex");
  const pkg = `prepay_id=${prepayId}`;
  const message = `${appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
  const paySign = c.sha256WithRsa(message);
  return {
    timeStamp,
    nonceStr,
    package: pkg,
    signType: "RSA",
    paySign,
  };
}

// 验签回调头；需要传入原始 body 字符串
export async function verifyNotify(headers, rawBody) {
  const c = client();
  if (!c) return false;
  const timestamp = headers["wechatpay-timestamp"];
  const nonce = headers["wechatpay-nonce"];
  const serial = headers["wechatpay-serial"];
  const signature = headers["wechatpay-signature"];
  if (!timestamp || !nonce || !serial || !signature) return false;
  try {
    return await c.verifySign({
      timestamp,
      nonce,
      body: rawBody,
      serial,
      signature,
      apiSecret: APIV3_KEY,
    });
  } catch (e) {
    console.error("微信回调验签失败：", String(e));
    return false;
  }
}

// 解密回调 resource 密文
export function decryptNotify(resource) {
  const c = client();
  if (!c) throw new Error("微信支付未配置");
  return c.decipher_gcm(
    resource.ciphertext,
    resource.associated_data,
    resource.nonce,
    APIV3_KEY
  );
}

// 按商户订单号查询微信侧支付结果（供前端恢复状态）
export async function queryOrder(orderNo) {
  const c = client();
  if (!c) throw new Error("微信支付未配置");
  const res = await c.query_order({ out_trade_no: orderNo });
  if (res.status === 200) return res.data;
  throw new Error(`查询订单失败：${(res.data && res.data.message) || res.error || res.errRaw}`);
}

// 退款（供后续售后/人工退款，本期仅保留能力，不对外开放）
export async function refundOrder({ orderNo, refundNo, amountFen, reason }) {
  const c = client();
  if (!c) throw new Error("微信支付未配置");
  const res = await c.refunds({
    out_trade_no: orderNo,
    out_refund_no: refundNo,
    amount: { refund: amountFen, total: amountFen, currency: "CNY" },
    reason: reason || "",
  });
  if (res.status === 200 || res.status === 201) return res.data;
  throw new Error(`退款失败：${(res.data && res.data.message) || res.error || res.errRaw}`);
}