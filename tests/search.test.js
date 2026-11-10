import test from "node:test";
import assert from "node:assert/strict";
import { filterOffers, searchDestinations, sortDestinations, validateFilters } from "../src/domain/search.js";
import { getDefaultDates, DEMO_HISTORY, DEMO_OFFERS } from "../src/data/demo-data.js";

const today = new Date("2026-11-10T00:00:00Z");
const dates = { dateStart: "2026-12-01", dateEnd: "2026-12-10" };
const filters = {
  origin: "SEL",
  ...dates,
  daysMin: 7,
  daysMax: 10,
  cabin: "economy",
  airline: "skyteam",
  region: "asia",
  directOnly: true,
  includeTaxes: true,
  budget: 600000,
};

function makeOffer(overrides = {}) {
  return {
    id: "one",
    originCode: "ICN",
    destinationCode: "NRT",
    destination: "도쿄",
    region: "asia",
    airlineCode: "KE",
    cabin: "economy",
    direct: true,
    departureDate: "2026-12-03",
    returnDate: "2026-12-11",
    priceExclTax: 280000,
    priceInclTax: 320000,
    currency: "KRW",
    ...overrides,
  };
}

test("filter applies origin, departure dates, duration, carrier, cabin, stops, region, and budget", () => {
  const offers = [
    makeOffer(),
    makeOffer({ id: "transfer", destinationCode: "BKK", direct: false }),
    makeOffer({ id: "europe", destinationCode: "MXP", region: "europe" }),
    makeOffer({ id: "other-airline", destinationCode: "NRT", airlineCode: "OZ" }),
    makeOffer({ id: "late", destinationCode: "NRT", departureDate: "2026-12-11" }),
    makeOffer({ id: "too-long", destinationCode: "NRT", returnDate: "2026-12-15" }),
    makeOffer({ id: "too-expensive", destinationCode: "NRT", priceInclTax: 700000 }),
    makeOffer({ id: "gmp", destinationCode: "NRT", originCode: "GMP" }),
  ];
  const result = filterOffers(offers, filters);
  assert.deepEqual(result.map((item) => item.id), ["one", "gmp"]);
});

test("tax toggle changes which fare is compared to the budget", () => {
  const offer = makeOffer({ priceExclTax: 480000, priceInclTax: 520000 });
  assert.equal(filterOffers([offer], { ...filters, budget: 500000, includeTaxes: true }).length, 0);
  assert.equal(filterOffers([offer], { ...filters, budget: 500000, includeTaxes: false }).length, 1);
});

test("SkyTeam filter includes member fixtures and excludes non-member fixtures", () => {
  const offers = [makeOffer(), makeOffer({ id: "oz", airlineCode: "OZ" })];
  assert.deepEqual(filterOffers(offers, filters).map((item) => item.id), ["one"]);
  assert.equal(filterOffers(offers, { ...filters, airline: "all" }).length, 2);
  assert.equal(filterOffers(offers, { ...filters, airline: "korean" }).length, 1);
});

test("search groups by destination and selects the cheapest matching itinerary", () => {
  const offers = [
    makeOffer({ id: "expensive", priceInclTax: 400000 }),
    makeOffer({ id: "cheapest", priceInclTax: 320000 }),
    makeOffer({ id: "bangkok", destinationCode: "BKK", destination: "방콕", priceInclTax: 500000 }),
  ];
  const results = searchDestinations({ offers, history: [], filters, asOf: today });
  assert.equal(results.length, 2);
  assert.equal(results.find((item) => item.destinationCode === "NRT").id, "cheapest");
  assert.equal(results.every((item) => item.score === "insufficient"), true);
});

test("opportunity sort prioritizes score before absolute fare", () => {
  const results = searchDestinations({ offers: DEMO_OFFERS, history: DEMO_HISTORY, filters: { ...filters, ...getDefaultDates(today), airline: "all", region: "all", budget: 2000000 }, asOf: today });
  const sorted = sortDestinations(results, "opportunity");
  assert.equal(sorted[0].score, "buy");
  assert.ok(sorted.indexOf(sorted.find((item) => item.score === "insufficient")) > 0);
  const byPrice = sortDestinations(results, "price");
  assert.equal(byPrice[0].currentPrice, Math.min(...results.map((item) => item.currentPrice)));
});

test("validation reports reversed dates, dates outside one year, and invalid durations", () => {
  assert.match(validateFilters({ ...filters, dateStart: "2026-12-10", dateEnd: "2026-12-01" }, today), /시작일/);
  assert.match(validateFilters({ ...filters, dateEnd: "2027-11-11" }, today), /1년/);
  assert.match(validateFilters({ ...filters, dateStart: "", dateEnd: "" }, today), /모두 입력/);
  assert.match(validateFilters({ ...filters, daysMin: 11, daysMax: 10 }, today), /최소 여행 일수/);
  assert.match(validateFilters({ ...filters, daysMin: 0 }, today), /1일 이상의 정수/);
  assert.match(validateFilters({ ...filters, budget: 0 }, today), /최대 예산/);
  assert.equal(validateFilters({ ...filters, ...getDefaultDates(today) }, today), null);
});
