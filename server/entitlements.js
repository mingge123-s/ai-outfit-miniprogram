function parseExpiry(value) {
  if (!value) return null;
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${String(value).replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function effectiveMemberLevel(user, now = Date.now()) {
  if (user?.member_level !== "member") return "free";
  const expiresAt = parseExpiry(user.member_expires_at);
  return expiresAt === null || expiresAt > now ? "member" : "free";
}

export function entitlementsFor(user, limits, now = Date.now()) {
  const memberLevel = effectiveMemberLevel(user, now);
  const isMember = memberLevel === "member";
  return {
    memberLevel,
    memberExpiresAt: isMember ? (user.member_expires_at || null) : null,
    dailyLimit: isMember ? limits.memberDailyLimit : limits.freeDailyLimit,
    wardrobeLimit: isMember ? limits.memberWardrobeLimit : limits.freeWardrobeLimit,
    personPhotoLimit: isMember ? limits.memberPersonPhotoLimit : limits.freePersonPhotoLimit,
    outfitLimit: isMember ? limits.memberOutfitLimit : limits.freeOutfitLimit,
  };
}
