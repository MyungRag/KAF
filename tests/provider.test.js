import test from "node:test";
import assert from "node:assert/strict";
import { DemoFlightProvider } from "../src/data/flight-provider.js";

test("demo provider is repeatable, offline, and clearly identified as sample data", async () => {
  const provider = new DemoFlightProvider();
  const first = await provider.search({});
  const second = await provider.search({});
  assert.equal(first.mode, "demo");
  assert.equal(first.sourceLabel, "예시 데이터 · 실시간 아님");
  assert.ok(first.offers.length > 0);
  assert.ok(first.history.length > 0);
  assert.equal(first.offers, second.offers);
  assert.equal(first.history, second.history);
});
