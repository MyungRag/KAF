import { getPriceStats, getPriceScore, priceFor, SCORE_DETAILS } from "./pricing.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SKYTEAM_CODES = new Set(["KE", "AF", "DL", "CI", "VN"]);

export function differenceInDays(start, end) {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  return Math.round((to - from) / DAY_MS);
}

export function validateFilters(filters, today = new Date()) {
  if (!filters.dateStart || !filters.dateEnd) return "출발 가능 기간을 모두 입력해 주세요.";
  if (filters.dateStart > filters.dateEnd) return "시작일은 종료일보다 늦을 수 없어요.";

  const todayString = today.toISOString().slice(0, 10);
  const maxDate = new Date(today.getTime() + 365 * DAY_MS).toISOString().slice(0, 10);
  if (filters.dateStart < todayString || filters.dateEnd > maxDate) {
    return "출발일은 오늘부터 1년 이내로 선택해 주세요.";
  }

  if (!Number.isInteger(filters.daysMin) || !Number.isInteger(filters.daysMax) || filters.daysMin < 1 || filters.daysMax < 1) {
    return "여행 일수는 1일 이상의 정수로 입력해 주세요.";
  }
  if (filters.daysMin > filters.daysMax) return "최소 여행 일수는 최대 여행 일수보다 클 수 없어요.";
  if (filters.budget !== null && (!Number.isFinite(filters.budget) || filters.budget <= 0)) {
    return "최대 예산은 1원 이상의 숫자로 입력해 주세요.";
  }
  return null;
}

function matchesAirline(offer, filter) {
  if (filter === "korean") return offer.airlineCode === "KE";
  if (filter === "skyteam") return SKYTEAM_CODES.has(offer.airlineCode);
  return true;
}

function matchesOrigin(offer, origin) {
  return origin === "SEL" ? ["ICN", "GMP"].includes(offer.originCode) : offer.originCode === origin;
}

export function filterOffers(offers, filters) {
  return offers.filter((offer) => {
    const tripDays = differenceInDays(offer.departureDate, offer.returnDate);
    const price = priceFor(offer, filters.includeTaxes);
    return matchesOrigin(offer, filters.origin) &&
      offer.departureDate >= filters.dateStart &&
      offer.departureDate <= filters.dateEnd &&
      tripDays >= filters.daysMin &&
      tripDays <= filters.daysMax &&
      offer.cabin === filters.cabin &&
      matchesAirline(offer, filters.airline) &&
      (!filters.directOnly || offer.direct) &&
      (filters.region === "all" || offer.region === filters.region) &&
      (filters.budget === null || price <= filters.budget);
  });
}

export function searchDestinations({ offers, history, filters, asOf = new Date() }) {
  const matchingOffers = filterOffers(offers, filters);
  const cheapestByDestination = new Map();

  for (const offer of matchingOffers) {
    const current = priceFor(offer, filters.includeTaxes);
    const previous = cheapestByDestination.get(offer.destinationCode);
    if (!previous || current < priceFor(previous, filters.includeTaxes)) {
      cheapestByDestination.set(offer.destinationCode, offer);
    }
  }

  return [...cheapestByDestination.values()].map((offer) => {
    const stats = getPriceStats(offer, history, filters, asOf);
    const score = stats.sufficient ? getPriceScore(stats.current, stats.min, stats.average) : "insufficient";
    return {
      ...offer,
      tripDays: differenceInDays(offer.departureDate, offer.returnDate),
      includeTaxes: filters.includeTaxes,
      currentPrice: priceFor(offer, filters.includeTaxes),
      stats,
      score,
      scoreDetails: SCORE_DETAILS[score],
    };
  });
}

export function sortDestinations(results, sort = "opportunity") {
  return [...results].sort((left, right) => {
    if (sort === "price") return left.currentPrice - right.currentPrice;
    const scoreDifference = left.scoreDetails.rank - right.scoreDetails.rank;
    if (scoreDifference !== 0) return scoreDifference;
    if (left.stats.sufficient && right.stats.sufficient) {
      return left.stats.deltaFromLowPercent - right.stats.deltaFromLowPercent || left.currentPrice - right.currentPrice;
    }
    return left.currentPrice - right.currentPrice;
  });
}
