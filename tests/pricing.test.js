import test from "node:test";
import assert from "node:assert/strict";
import { getPriceScore, getPriceStats } from "../src/domain/pricing.js";

const asOf = new Date("2026-11-10T00:00:00Z");
const offer = {
  originCode: "ICN",
  destinationCode: "NRT",
  airlineCode: "KE",
  cabin: "economy",
  direct: true,
  tripDays: 8,
  currency: "KRW",
  priceExclTax: 280000,
  priceInclTax: 320000,
};
const filters = { daysMin: 7, daysMax: 10, includeTaxes: true };

function sample(observedAt, priceInclTax, changes = {}) {
  return {
    originCode: "ICN",
    destinationCode: "NRT",
    airlineCode: "KE",
    cabin: "economy",
    direct: true,
    tripDays: 8,
    currency: "KRW",
    observedAt,
    priceExclTax: priceInclTax - 40000,
    priceInclTax,
    ...changes,
  };
}

test("price score follows non-overlapping specification boundaries in order", () => {
  assert.equal(getPriceScore(99, 100, 130), "buy");
  assert.equal(getPriceScore(100, 100, 130), "buy");
  assert.equal(getPriceScore(105, 100, 130), "excellent");
  assert.equal(getPriceScore(105.01, 100, 130), "good");
  assert.equal(getPriceScore(110, 100, 130), "good");
  assert.equal(getPriceScore(110.01, 100, 130), "normal");
  assert.equal(getPriceScore(130, 100, 130), "normal");
  assert.equal(getPriceScore(130.01, 100, 130), "wait");
  assert.equal(getPriceScore(104, 100, 103), "excellent", "earlier threshold wins if a narrow range overlaps average");
  assert.equal(getPriceScore(100, 0, 130), "insufficient");
});

test("price stats use only matching records over a full recent year", () => {
  const history = [
    sample("2025-11-10", 300000),
    sample("2026-02-10", 350000),
    sample("2026-05-10", 400000),
    sample("2026-08-10", 450000),
    sample("2026-11-10", 500000),
    sample("2026-11-10", 100000, { airlineCode: "AF" }),
  ];
  const stats = getPriceStats(offer, history, filters, asOf);
  assert.equal(stats.sufficient, true);
  assert.equal(stats.sampleCount, 5);
  assert.equal(stats.min, 300000);
  assert.equal(stats.max, 500000);
  assert.equal(stats.average, 400000);
  assert.equal(stats.deltaFromLowPercent, (320000 - 300000) / 300000 * 100);
});

test("price stats hide recommendations when a year is not represented", () => {
  const history = [sample("2026-08-10", 300000), sample("2026-11-10", 320000)];
  const stats = getPriceStats(offer, history, filters, asOf);
  assert.equal(stats.sufficient, false);
});

test("price stats keep tax-inclusive and tax-exclusive views separate", () => {
  const history = [
    sample("2025-11-10", 300000),
    sample("2026-05-10", 400000),
    sample("2026-11-10", 500000),
  ];
  const stats = getPriceStats(offer, history, { ...filters, includeTaxes: false }, asOf);
  assert.equal(stats.min, 260000);
  assert.equal(stats.current, 280000);
});
