// 微信侧报告交易成功后，在发放权益前与本地订单逐项核对。
export function validateSuccessfulPayment(order, payment, expectedMchid = "") {
  if (!order || !payment || payment.trade_state !== "SUCCESS") {
    throw new Error("支付状态未确认成功");
  }
  if (!payment.out_trade_no || payment.out_trade_no !== order.order_no) {
    throw new Error("商户订单号不匹配");
  }
  const paidFen = Number(payment.amount && payment.amount.total);
  if (!Number.isInteger(paidFen) || paidFen !== order.amount_fen) {
    throw new Error("交易金额不匹配");
  }
  if (!payment.transaction_id) {
    throw new Error("缺少微信支付交易号");
  }
  if (expectedMchid && payment.mchid && payment.mchid !== expectedMchid) {
    throw new Error("商户号不匹配");
  }
  if (order.openid && payment.payer && payment.payer.openid && payment.payer.openid !== order.openid) {
    throw new Error("付款用户不匹配");
  }
  return true;
}
