const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

const referenceDate = new Date();
const departure = addDays(referenceDate, 78);

// Airport reference points from the public-domain OurAirports dataset:
// https://ourairports.com/data/
export const AIRPORTS = {
  ICN: { name: "인천국제공항", latitude: 37.469101, longitude: 126.450996 },
  NRT: { name: "나리타 국제공항", latitude: 35.76858, longitude: 140.388714 },
  BKK: { name: "수완나품 국제공항", latitude: 13.6811, longitude: 100.747002 },
  DAD: { name: "다낭 국제공항", latitude: 16.0439, longitude: 108.198997 },
  SIN: { name: "싱가포르 창이 국제공항", latitude: 1.35019, longitude: 103.994003 },
  MXP: { name: "밀라노 말펜사 국제공항", latitude: 45.6306, longitude: 8.72811 },
  CDG: { name: "파리 샤를 드골 공항", latitude: 49.00896, longitude: 2.554117 },
  FCO: { name: "로마 피우미치노 공항", latitude: 41.804532, longitude: 12.251998 },
};

function fare({ id, destinationCode, destination, region, airlineCode, airlineName, originCode = "ICN", direct = true, cabin = "economy", departureOffset, tripDays, priceExclTax, tax, sourceId = "KAF-DEMO" }) {
  const departureDate = addDays(new Date(`${departure}T00:00:00Z`), departureOffset);
  const returnDate = addDays(new Date(`${departureDate}T00:00:00Z`), tripDays);
  const airport = AIRPORTS[destinationCode];
  return {
    id,
    originCode,
    originName: originCode === "ICN" ? "인천" : "김포",
    destinationCode,
    destination,
    destinationAirportName: airport.name,
    region,
    latitude: airport.latitude,
    longitude: airport.longitude,
    airlineCode,
    airlineName,
    alliance: ["KE", "AF", "DL", "CI", "VN"].includes(airlineCode) ? "SkyTeam" : null,
    direct,
    cabin,
    departureDate,
    returnDate,
    tripDays,
    priceExclTax,
    tax,
    priceInclTax: priceExclTax + tax,
    currency: "KRW",
    source: sourceId,
    observedAt: addDays(referenceDate, -1),
    dataMode: "demo",
  };
}

export const DEMO_OFFERS = [
  fare({ id: "tokyo-ke", destinationCode: "NRT", destination: "도쿄", region: "asia", airlineCode: "KE", airlineName: "대한항공", departureOffset: 1, tripDays: 8, priceExclTax: 278000, tax: 42000 }),
  fare({ id: "tokyo-oz", destinationCode: "NRT", destination: "도쿄", region: "asia", airlineCode: "OZ", airlineName: "아시아나항공", departureOffset: 0, tripDays: 9, priceExclTax: 225000, tax: 65000 }),
  fare({ id: "bangkok-ke", destinationCode: "BKK", destination: "방콕", region: "asia", airlineCode: "KE", airlineName: "대한항공", departureOffset: 3, tripDays: 8, priceExclTax: 458000, tax: 52000 }),
  fare({ id: "danang-ke", destinationCode: "DAD", destination: "다낭", region: "asia", airlineCode: "KE", airlineName: "대한항공", departureOffset: 4, tripDays: 8, priceExclTax: 420000, tax: 50000 }),
  fare({ id: "danang-vn-transfer", destinationCode: "DAD", destination: "다낭", region: "asia", airlineCode: "VN", airlineName: "베트남항공", direct: false, departureOffset: 0, tripDays: 10, priceExclTax: 365000, tax: 55000 }),
  fare({ id: "singapore-ke", destinationCode: "SIN", destination: "싱가포르", region: "asia", airlineCode: "KE", airlineName: "대한항공", departureOffset: 0, tripDays: 7, priceExclTax: 452000, tax: 48000 }),
  fare({ id: "milan-af", destinationCode: "MXP", destination: "밀라노", region: "europe", airlineCode: "AF", airlineName: "에어프랑스", departureOffset: 1, tripDays: 9, priceExclTax: 755000, tax: 65000 }),
  fare({ id: "paris-ke", destinationCode: "CDG", destination: "파리", region: "europe", airlineCode: "KE", airlineName: "대한항공", departureOffset: 0, tripDays: 8, priceExclTax: 842000, tax: 68000 }),
  fare({ id: "rome-ke", destinationCode: "FCO", destination: "로마", region: "europe", airlineCode: "KE", airlineName: "대한항공", departureOffset: 5, tripDays: 9, priceExclTax: 780000, tax: 70000 }),
  fare({ id: "seoul-business", destinationCode: "NRT", destination: "도쿄", region: "asia", airlineCode: "KE", airlineName: "대한항공", cabin: "business", departureOffset: 2, tripDays: 8, priceExclTax: 980000, tax: 90000 }),
];

const HISTORICAL_PRICES = {
  "tokyo-ke": [300000, 340000, 390000, 440000, 520000],
  "bangkok-ke": [450000, 560000, 690000, 760000, 900000],
  "danang-ke": [430000, 470000, 520000, 590000, 700000],
  "danang-vn-transfer": [390000, 440000, 510000, 590000, 680000],
  "singapore-ke": [500000, 560000, 620000, 690000, 780000],
  "milan-af": [790000, 840000, 950000, 1030000, 1350000],
  "paris-ke": [720000, 830000, 960000, 1120000, 1350000],
  "rome-ke": [650000, 720000, 810000, 950000, 1240000],
  "seoul-business": [1050000, 1150000, 1320000, 1480000, 1750000],
};

export function createDemoHistory(offers = DEMO_OFFERS, asOf = referenceDate) {
  return offers.flatMap((offer) => {
    const prices = HISTORICAL_PRICES[offer.id];
    if (!prices) return [];
    return prices.map((priceInclTax, index) => {
      const daysBefore = [365, 270, 180, 90, 0][index];
      const priceExclTax = Math.round(priceInclTax - offer.tax);
      return {
        id: `${offer.id}-history-${index + 1}`,
        originCode: offer.originCode,
        destinationCode: offer.destinationCode,
        airlineCode: offer.airlineCode,
        cabin: offer.cabin,
        direct: offer.direct,
        tripDays: offer.tripDays,
        currency: offer.currency,
        observedAt: addDays(asOf, -daysBefore),
        priceExclTax,
        priceInclTax,
        dataMode: "demo",
      };
    });
  });
}

export const DEMO_HISTORY = createDemoHistory();
export const DEMO_AS_OF = referenceDate;
export const DEMO_NOTICE = "예시 데이터 · 실시간 아님";

export const DEFAULTS = {
  origin: "ICN",
  cabin: "economy",
  airline: "skyteam",
  region: "all",
  directOnly: true,
  includeTaxes: true,
  budget: 1000000,
  daysMin: 7,
  daysMax: 10,
};

export function getDefaultDates(today = new Date()) {
  const start = addDays(today, 78);
  const end = addDays(today, 87);
  return { dateStart: start, dateEnd: end };
}
