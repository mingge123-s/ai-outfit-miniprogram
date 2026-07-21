import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidatePool,
  fallbackSelection,
  normalizeSelection,
  summarizeWeather,
  wardrobeRequirements,
  weatherFromPreset,
} from "./today-outfit.js";

const wardrobe = [
  { id: 8, category: "top" },
  { id: 7, category: "pants" },
  { id: 6, category: "shoes" },
  { id: 5, category: "coat" },
  { id: 4, category: "accessory" },
];

test("weather codes become neutral client weather data", () => {
  const weather = summarizeWeather({
    weather_code: 61,
    temperature_2m: 18.6,
    apparent_temperature: 17.7,
    precipitation: 2.2,
    wind_speed_10m: 15.5,
    relative_humidity_2m: 88,
  });
  assert.equal(weather.conditionLabel, "有雨");
  assert.equal(weather.temperature, 19);
  assert.equal(weather.isRain, true);
});

test("complete wardrobe requires a body outfit and shoes", () => {
  assert.equal(wardrobeRequirements(wardrobe, weatherFromPreset("mild")).complete, true);
  assert.deepEqual(
    wardrobeRequirements([{ id: 1, category: "top" }], weatherFromPreset("mild")).missing,
    ["上衣+裤子或裙装", "鞋子"],
  );
});

test("cold weather fallback includes a coat", () => {
  const selected = fallbackSelection(wardrobe, weatherFromPreset("cold"));
  assert.deepEqual(selected.map((item) => item.category), ["top", "pants", "shoes", "coat", "accessory"]);
});

test("invalid model selection falls back to a complete outfit", () => {
  const selected = normalizeSelection([8], wardrobe, weatherFromPreset("mild"));
  assert.deepEqual(selected.slice(0, 3).map((item) => item.category), ["top", "pants", "shoes"]);
});

test("candidate pool limits repeated categories", () => {
  const items = Array.from({ length: 8 }, (_, index) => ({ id: 20 - index, category: "top" }))
    .concat(wardrobe);
  const pool = buildCandidatePool(items, 2, 10);
  assert.equal(pool.filter((item) => item.category === "top").length, 2);
  assert.ok(pool.length <= 10);
});
