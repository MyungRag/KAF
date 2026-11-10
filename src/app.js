import { DEFAULTS, getDefaultDates } from "./data/demo-data.js";
import { DemoFlightProvider } from "./data/flight-provider.js";
import { formatPercent, formatWon } from "./domain/pricing.js";
import { searchDestinations, sortDestinations, validateFilters } from "./domain/search.js";

const form = document.querySelector("#search-form");
const startInput = document.querySelector("#date-start");
const endInput = document.querySelector("#date-end");
const errorBox = document.querySelector("#form-error");
const list = document.querySelector("#result-list");
const markers = document.querySelector("#map-markers");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const resultSummary = document.querySelector("#result-summary");
const sortSelect = document.querySelector("#sort-select");
const activeFilter = document.querySelector("#active-filter");

const flightProvider = new DemoFlightProvider();
let currentResults = [];
let selectedDestination = null;
let currentSourceNotice = "예시 데이터 · 실시간 아님";

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function setDateLimits() {
  const today = new Date();
  const maxDate = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  const todayString = isoDate(today);
  const maxString = isoDate(maxDate);
  startInput.min = todayString;
  endInput.min = todayString;
  startInput.max = maxString;
  endInput.max = maxString;
  const defaults = getDefaultDates(today);
  startInput.value = defaults.dateStart;
  endInput.value = defaults.dateEnd;
}

function readFilters() {
  const budgetText = document.querySelector("#budget").value.trim();
  return {
    origin: document.querySelector("#origin").value,
    dateStart: startInput.value,
    dateEnd: endInput.value,
    daysMin: Number(document.querySelector("#days-min").value),
    daysMax: Number(document.querySelector("#days-max").value),
    cabin: document.querySelector("#cabin").value,
    airline: document.querySelector("#airline").value,
    region: document.querySelector("#region").value,
    directOnly: document.querySelector("#direct-only").checked,
    includeTaxes: document.querySelector("#include-taxes").checked,
    budget: budgetText === "" ? null : Number(budgetText),
  };
}

function priceLabel(price) {
  if (!Number.isFinite(price)) return "—";
  return `${Math.round(price / 10000).toLocaleString("ko-KR")}만`;
}

function originName(code) {
  return code === "ICN" ? "인천" : "서울";
}

function cabinName(code) {
  return code === "economy" ? "일반석" : "비즈니스석";
}

function dateLabel(date) {
  const value = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(value);
}

function routeDuration(result) {
  return `${dateLabel(result.departureDate)} – ${dateLabel(result.returnDate)} · ${result.tripDays}일`;
}

function renderStats(result) {
  if (!result.stats.sufficient) {
    return `<div class="price-range insufficient-range"><div><span>최근 365일 가격</span><strong>데이터 축적 중</strong></div><div><span>비교 기록</span><strong>${result.stats.sampleCount ?? 0}건</strong></div></div>`;
  }
  const delta = formatPercent(result.stats.deltaFromLowPercent);
  const deltaClass = result.stats.deltaFromLowPercent < 0 ? "negative" : "";
  return `<div class="price-range">
    <div><span>365일 최저</span><strong>${priceLabel(result.stats.min)}원</strong></div>
    <div><span>평균</span><strong>${priceLabel(result.stats.average)}원</strong></div>
    <div><span>최고</span><strong>${priceLabel(result.stats.max)}원</strong></div>
    <div class="price-delta"><strong class="${deltaClass}">${delta}</strong><span>최저 대비</span></div>
  </div>`;
}

function cardMarkup(result) {
  const badge = result.scoreDetails;
  const sourceDate = dateLabel(result.observedAt);
  const taxLabel = result.includeTaxes === false ? "세금 제외" : "세금 포함";
  return `<button class="destination-card ${selectedDestination === result.destinationCode ? "selected" : ""}" type="button" data-destination="${result.destinationCode}" aria-pressed="${selectedDestination === result.destinationCode}">
    <span class="card-topline">
      <span class="destination-name"><strong>${result.destination}</strong><span>${result.destinationCode}</span></span>
      <span class="opportunity-badge ${badge.className}">${badge.icon} ${badge.label}</span>
    </span>
    <span class="card-price-row">
      <span><span class="card-price-label">조건 일치 최저 운임 · 왕복</span><strong class="card-price">${formatWon(result.currentPrice)}<small>${taxLabel}</small></strong></span>
    </span>
    ${renderStats(result)}
    <span class="flight-meta">
      <span>${result.airlineName}</span><i class="meta-dot"></i>
      <span>${result.direct ? "직항" : "경유 포함"}</span><i class="meta-dot"></i>
      <span>${cabinName(result.cabin)}</span>
    </span>
    <span class="flight-meta"><span>${originName(result.originCode)} 출발</span><i class="meta-dot"></i><span>${routeDuration(result)}</span></span>
    <span class="sample-label">${currentSourceNotice} · ${result.source} 예시 기록 ${sourceDate}</span>
  </button>`;
}

function positionFor(result) {
  const x = ((result.longitude + 180) / 360) * 100;
  const y = ((90 - result.latitude) / 180) * 100;
  const nudge = {
    BKK: [0, -15],
    DAD: [32, 10],
    SIN: [45, 12],
    MXP: [-12, -14],
    CDG: [-28, -25],
    FCO: [15, 12],
  }[result.destinationCode] ?? [0, 0];
  return { x, y, dx: nudge[0], dy: nudge[1] };
}

function markerMarkup(result) {
  const { x, y, dx, dy } = positionFor(result);
  const style = `left:calc(${x}% + ${dx}px);top:calc(${y}% + ${dy}px)`;
  const markerClass = result.score === "buy" ? "opportunity-hot" : ["excellent", "good"].includes(result.score) ? "opportunity-good" : "";
  const edgeClass = ["NRT", "BKK", "DAD", "SIN"].includes(result.destinationCode) ? "edge-east" : "";
  return `<button class="map-marker ${markerClass} ${edgeClass}" type="button" style="${style}" data-destination="${result.destinationCode}" aria-label="${result.destination} 현재 예시 가격 ${formatWon(result.currentPrice)}, ${result.scoreDetails.label}" aria-pressed="${selectedDestination === result.destinationCode}"><span class="marker-dot"></span><span>${result.destination} <strong>${priceLabel(result.currentPrice)}</strong></span></button>`;
}

function updateSelection(destinationCode) {
  selectedDestination = destinationCode;
  renderLists(currentResults);
}

function renderLists(results) {
  list.innerHTML = results.map(cardMarkup).join("");
  markers.innerHTML = results.map(markerMarkup).join("");
  resultCount.textContent = `${results.length}곳`;
  emptyState.hidden = results.length !== 0;
  list.hidden = results.length === 0;

  for (const element of document.querySelectorAll("[data-destination]")) {
    element.addEventListener("click", () => updateSelection(element.dataset.destination));
  }
}

function currentFilterLabel(filters) {
  const parts = [originName(filters.origin), cabinName(filters.cabin)];
  if (filters.airline === "korean") parts.push("대한항공");
  if (filters.airline === "skyteam") parts.push("SkyTeam");
  if (filters.directOnly) parts.push("직항");
  return parts.join(" · ");
}

async function runSearch() {
  const filters = readFilters();
  const error = validateFilters(filters);
  errorBox.textContent = error ?? "";
  errorBox.hidden = !error;
  if (error) {
    currentResults = [];
    renderLists(currentResults);
    resultSummary.textContent = "검색 조건을 확인해 주세요.";
    return;
  }

  const dataset = await flightProvider.search(filters);
  currentSourceNotice = dataset.sourceLabel;
  currentResults = sortDestinations(searchDestinations({
    offers: dataset.offers,
    history: dataset.history,
    filters,
    asOf: dataset.observedAt,
  }), sortSelect.value);
  selectedDestination = currentResults[0]?.destinationCode ?? null;
  resultSummary.textContent = `${currentFilterLabel(filters)} 조건에서 예시 목적지 ${currentResults.length}곳을 찾았어요.`;
  activeFilter.textContent = `${currentFilterLabel(filters)} ×`;
  activeFilter.hidden = false;
  renderLists(currentResults);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void runSearch();
});

sortSelect.addEventListener("change", () => {
  currentResults = sortDestinations(currentResults, sortSelect.value);
  renderLists(currentResults);
});

document.querySelector("#reset-button").addEventListener("click", () => {
  document.querySelector("#origin").value = DEFAULTS.origin;
  document.querySelector("#days-min").value = DEFAULTS.daysMin;
  document.querySelector("#days-max").value = DEFAULTS.daysMax;
  document.querySelector("#cabin").value = DEFAULTS.cabin;
  document.querySelector("#airline").value = DEFAULTS.airline;
  document.querySelector("#region").value = DEFAULTS.region;
  document.querySelector("#direct-only").checked = DEFAULTS.directOnly;
  document.querySelector("#include-taxes").checked = DEFAULTS.includeTaxes;
  document.querySelector("#budget").value = DEFAULTS.budget;
  sortSelect.value = "opportunity";
  setDateLimits();
  void runSearch();
});

activeFilter.addEventListener("click", () => {
  document.querySelector("#direct-only").checked = false;
  document.querySelector("#airline").value = "all";
  activeFilter.hidden = true;
  void runSearch();
});

setDateLimits();
void runSearch();
