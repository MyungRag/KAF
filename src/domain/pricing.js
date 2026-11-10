export const HISTORY_WINDOW_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

export function priceFor(offer, includeTaxes = true) {
  return includeTaxes ? offer.priceInclTax : offer.priceExclTax;
}

export function getPriceStats(offer, history, filters, asOf = new Date()) {
  const windowStart = new Date(asOf.getTime() - HISTORY_WINDOW_DAYS * DAY_MS);
  const startDate = windowStart.toISOString().slice(0, 10);
  const endDate = asOf.toISOString().slice(0, 10);
  const samples = history.filter((sample) =>
    sample.originCode === offer.originCode &&
    sample.destinationCode === offer.destinationCode &&
    sample.airlineCode === offer.airlineCode &&
    sample.cabin === offer.cabin &&
    sample.direct === offer.direct &&
    sample.tripDays >= filters.daysMin &&
    sample.tripDays <= filters.daysMax &&
    sample.currency === offer.currency &&
    sample.observedAt >= startDate &&
    sample.observedAt <= endDate,
  );

  if (samples.length < 2) return { sufficient: false, sampleCount: samples.length };

  const observedDates = samples.map((sample) => sample.observedAt).sort();
  const first = new Date(`${observedDates[0]}T00:00:00Z`);
  const last = new Date(`${observedDates.at(-1)}T00:00:00Z`);
  const coveredDays = Math.floor((last - first) / DAY_MS);
  const daysSinceLastSample = Math.floor((asOf - last) / DAY_MS);

  // A sparse sample is not described as a full year of history unless it reaches both ends.
  if (coveredDays < HISTORY_WINDOW_DAYS - 2 || daysSinceLastSample > 3) {
    return { sufficient: false, sampleCount: samples.length, coveredDays };
  }

  const prices = samples.map((sample) => filters.includeTaxes ? sample.priceInclTax : sample.priceExclTax);
  const sum = prices.reduce((total, price) => total + price, 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = sum / prices.length;
  const current = priceFor(offer, filters.includeTaxes);

  return {
    sufficient: true,
    sampleCount: samples.length,
    min,
    average,
    max,
    current,
    deltaFromLowPercent: min > 0 ? ((current - min) / min) * 100 : null,
    firstObservedAt: observedDates[0],
    lastObservedAt: observedDates.at(-1),
  };
}

export function getPriceScore(current, min, average) {
  if (![current, min, average].every(Number.isFinite) || min <= 0) return "insufficient";
  if (current <= min) return "buy";
  if (current <= min * 1.05) return "excellent";
  if (current <= min * 1.1) return "good";
  if (current <= average) return "normal";
  return "wait";
}

export const SCORE_DETAILS = {
  buy: { label: "적극 매수", icon: "🔥", rank: 0, className: "hot" },
  excellent: { label: "매우 좋음", icon: "✦", rank: 1, className: "opportunity-good" },
  good: { label: "좋음", icon: "↗", rank: 2, className: "opportunity-good" },
  normal: { label: "보통", icon: "·", rank: 3, className: "" },
  wait: { label: "기다림", icon: "◷", rank: 4, className: "wait" },
  insufficient: { label: "데이터 축적 중", icon: "…", rank: 5, className: "unknown" },
};

export function formatWon(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}
