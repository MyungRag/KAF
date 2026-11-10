import { DEMO_AS_OF, DEMO_HISTORY, DEMO_NOTICE, DEMO_OFFERS } from "./demo-data.js";

/**
 * Provider contract used by the search flow. A live provider can later implement
 * the same method without changing filtering, ranking, or UI code.
 */
export class DemoFlightProvider {
  async search() {
    return {
      offers: DEMO_OFFERS,
      history: DEMO_HISTORY,
      observedAt: DEMO_AS_OF,
      sourceLabel: DEMO_NOTICE,
      mode: "demo",
    };
  }
}
