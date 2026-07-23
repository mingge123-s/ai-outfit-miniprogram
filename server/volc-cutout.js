// 火山引擎视觉智能「主体分割/商品抠图」API（SaliencySeg）
// 采用火山 SigV4 签名（与 AWS SigV4 类似，scope 以 request 结尾）
import crypto from "crypto";

const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv";
const ACTION = "CVProcess";
const VERSION = "2022-08-31";
const REQ_KEY = "saliency_seg";

const VOLC_ACCESS_KEY = process.env.VOLC_ACCESS_KEY || "";
const VOLC_SECRET_KEY = process.env.VOLC_SECRET_KEY || "";

export function volcCutoutEnabled() {
  return Boolean(VOLC_ACCESS_KEY && VOLC_SECRET_KEY);
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signedHeaders(query, body) {
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const shortDate = xDate.slice(0, 8);
  const contentType = "application/json";
  const payloadHash = sha256Hex(body);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaderNames = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = [
    "POST",
    "/",
    query,
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join("\n");

  const scope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(VOLC_SECRET_KEY, shortDate);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    "Content-Type": contentType,
    Host: HOST,
    "X-Date": xDate,
    "X-Content-Sha256": payloadHash,
    Authorization: `HMAC-SHA256 Credential=${VOLC_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
  };
}

// 输入图片 base64，返回透明背景前景图 base64（PNG）；失败返回 null
export async function volcCutout(imageBase64) {
  if (!volcCutoutEnabled()) return null;
  const query = `Action=${ACTION}&Version=${VERSION}`;
  const body = JSON.stringify({ req_key: REQ_KEY, binary_data_base64: [imageBase64] });
  const headers = signedHeaders(query, body);
  try {
    const resp = await fetch(`https://${HOST}/?${query}`, { method: "POST", headers, body });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || data?.code !== 10000) {
      console.error(`火山抠图失败 (${resp.status}):`, JSON.stringify(data)?.slice(0, 300));
      return null;
    }
    const fg = data?.data?.binary_data_base64?.[0] || data?.data?.foreground_image;
    return typeof fg === "string" && fg ? fg : null;
  } catch (e) {
    console.error("火山抠图异常:", e?.message || e);
    return null;
  }
}
