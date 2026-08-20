export function allowedPayAppids(env = process.env) {
  return [...new Set(
    [env.WXPAY_APPID, env.WX_APPID, env.WX_APPID_2]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

export function resolvePayAppid(requested, env = process.env) {
  const allowed = allowedPayAppids(env);
  const fallback = env.WXPAY_APPID || env.WX_APPID || "";
  if (requested && allowed.includes(requested)) return requested;
  return fallback;
}
