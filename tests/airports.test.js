import test from "node:test";
import assert from "node:assert/strict";
import { AIRPORTS, DEMO_OFFERS } from "../src/data/demo-data.js";

test("demo offers use the airport coordinates for their destination IATA code", () => {
  for (const offer of DEMO_OFFERS) {
    const airport = AIRPORTS[offer.destinationCode];
    assert.ok(airport, "Missing airport coordinates for " + offer.destinationCode);
    assert.equal(offer.latitude, airport.latitude);
    assert.equal(offer.longitude, airport.longitude);
    assert.ok(offer.destinationAirportName);
  }
});

test("destination coordinates are airport locations, not city centroids", () => {
  assert.deepEqual(
    [AIRPORTS.NRT.latitude, AIRPORTS.NRT.longitude],
    [35.76858, 140.388714],
  );
  assert.deepEqual(
    [AIRPORTS.CDG.latitude, AIRPORTS.CDG.longitude],
    [49.00896, 2.554117],
  );
});
