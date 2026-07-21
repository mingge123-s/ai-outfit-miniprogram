export const OCCASIONS = new Set(["daily", "work", "date", "sport", "travel"]);

const WEATHER_LABELS = {
  clear: { label: "晴朗", icon: "☀️" },
  cloudy: { label: "多云", icon: "⛅" },
  fog: { label: "有雾", icon: "🌫️" },
  rain: { label: "有雨", icon: "🌧️" },
  snow: { label: "有雪", icon: "🌨️" },
  storm: { label: "雷雨", icon: "⛈️" },
};

function conditionFromCode(code) {
  if (code === 0) return "clear";
  if (code >= 1 && code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

export function summarizeWeather(current = {}, timezone = "Asia/Shanghai") {
  const condition = conditionFromCode(Number(current.weather_code));
  const display = WEATHER_LABELS[condition];
  const temperature = Number(current.temperature_2m);
  const apparentTemperature = Number(current.apparent_temperature);
  const precipitation = Number(current.precipitation || 0);
  const windSpeed = Number(current.wind_speed_10m || 0);
  const humidity = Number(current.relative_humidity_2m || 0);
  return {
    condition,
    conditionLabel: display.label,
    icon: display.icon,
    temperature: Number.isFinite(temperature) ? Math.round(temperature) : 20,
    apparentTemperature: Number.isFinite(apparentTemperature) ? Math.round(apparentTemperature) : 20,
    precipitation: Number.isFinite(precipitation) ? precipitation : 0,
    windSpeed: Number.isFinite(windSpeed) ? Math.round(windSpeed) : 0,
    humidity: Number.isFinite(humidity) ? Math.round(humidity) : 0,
    isRain: condition === "rain" || condition === "storm",
    isSnow: condition === "snow",
    timezone,
    observedAt: current.time || null,
  };
}

export function weatherFromPreset(preset) {
  const presets = {
    cold: { weather_code: 3, temperature_2m: 8, apparent_temperature: 5, wind_speed_10m: 18, relative_humidity_2m: 55 },
    mild: { weather_code: 1, temperature_2m: 22, apparent_temperature: 22, wind_speed_10m: 8, relative_humidity_2m: 50 },
    hot: { weather_code: 0, temperature_2m: 33, apparent_temperature: 36, wind_speed_10m: 6, relative_humidity_2m: 68 },
    rain: { weather_code: 61, temperature_2m: 19, apparent_temperature: 18, precipitation: 2.5, wind_speed_10m: 16, relative_humidity_2m: 88 },
  };
  const current = presets[preset];
  return current ? summarizeWeather(current) : null;
}

export function wardrobeRequirements(items, weather) {
  const categories = new Set(items.map((item) => item.category));
  const hasBody = categories.has("dress") || (categories.has("top") && categories.has("pants"));
  const missing = [];
  if (!hasBody) missing.push("上衣+裤子或裙装");
  if (!categories.has("shoes")) missing.push("鞋子");
  return {
    complete: missing.length === 0,
    missing,
    needsCoat: weather.apparentTemperature <= 16 || weather.isRain || weather.isSnow || weather.windSpeed >= 25,
  };
}

export function fallbackSelection(items, weather) {
  const byCategory = new Map();
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, item);
  }
  const selected = [];
  if (byCategory.has("dress")) {
    selected.push(byCategory.get("dress"));
  } else {
    if (byCategory.has("top")) selected.push(byCategory.get("top"));
    if (byCategory.has("pants")) selected.push(byCategory.get("pants"));
  }
  if (byCategory.has("shoes")) selected.push(byCategory.get("shoes"));
  const requirements = wardrobeRequirements(items, weather);
  if (requirements.needsCoat && byCategory.has("coat")) selected.push(byCategory.get("coat"));
  if (weather.isRain && byCategory.has("hat")) selected.push(byCategory.get("hat"));
  if (byCategory.has("accessory")) selected.push(byCategory.get("accessory"));
  return selected;
}

export function normalizeSelection(selectedIds, candidates, weather) {
  const candidateById = new Map(candidates.map((item) => [Number(item.id), item]));
  let selected = [];
  const usedCategories = new Set();
  for (const id of Array.isArray(selectedIds) ? selectedIds : []) {
    const item = candidateById.get(Number(id));
    if (!item || usedCategories.has(item.category)) continue;
    selected.push(item);
    usedCategories.add(item.category);
  }

  const hasCompleteBody = usedCategories.has("dress") || (usedCategories.has("top") && usedCategories.has("pants"));
  const hasShoes = usedCategories.has("shoes");
  if (!hasCompleteBody || !hasShoes) return fallbackSelection(candidates, weather);

  if (usedCategories.has("dress")) {
    selected = selected.filter((item) => item.category !== "top" && item.category !== "pants");
  }
  const normalizedCategories = new Set(selected.map((item) => item.category));
  const requirements = wardrobeRequirements(candidates, weather);
  if (requirements.needsCoat && !normalizedCategories.has("coat")) {
    const coat = candidates.find((item) => item.category === "coat");
    if (coat) selected.push(coat);
  }
  return selected.slice(0, 6);
}

export function buildCandidatePool(items, perCategory = 3, maxItems = 20) {
  const selected = [];
  const selectedIds = new Set();
  const counts = new Map();

  // 先保证每个已有类别至少进入一个候选，避免较旧的鞋子等必需品被截断。
  for (const item of items) {
    if (counts.has(item.category)) continue;
    counts.set(item.category, 1);
    selectedIds.add(item.id);
    selected.push(item);
    if (selected.length >= maxItems) return selected;
  }
  for (const item of items) {
    if (selectedIds.has(item.id)) continue;
    const count = counts.get(item.category) || 0;
    if (count >= perCategory) continue;
    counts.set(item.category, count + 1);
    selected.push(item);
    if (selected.length >= maxItems) break;
  }
  return selected;
}
