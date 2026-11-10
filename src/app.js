import { AIRPORTS, DEFAULTS, getDefaultDates } from "./data/demo-data.js";
import { DemoFlightProvider } from "./data/flight-provider.js";
import { formatPercent, formatWon } from "./domain/pricing.js";
import { searchDestinations, sortDestinations, validateFilters } from "./domain/search.js";

const form = document.querySelector("#search-form");
const startInput = document.querySelector("#date-start");
const endInput = document.querySelector("#date-end");
const errorBox = document.querySelector("#form-error");
const list = document.querySelector("#result-list");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const resultSummary = document.querySelector("#result-summary");
const sortSelect = document.querySelector("#sort-select");
const activeFilter = document.querySelector("#active-filter");

const flightProvider = new DemoFlightProvider();
const map = window.L?.map("map-canvas", {
  minZoom: 0,
  maxZoom: 9,
  scrollWheelZoom: false,
  maxBounds: [[-85, -180], [85, 180]],
  maxBoundsViscosity: 1,
}).fitBounds([[-60, -180], [82, 180]], { padding: [12, 12] });
const routeLayer = map ? window.L.layerGroup().addTo(map) : null;
const markerLayer = map ? window.L.layerGroup().addTo(map) : null;
const mapMarkers = new Map();
let currentResults = [];
let selectedDestination = null;
let currentSourceNotice = "예시 데이터 · 실시간 아님";

if (map) {
  map.getContainer().addEventListener("wheel", (event) => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    map.setZoom(map.getZoom() + (event.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    minZoom: 0,
    maxZoom: 9,
    noWrap: true,
    bounds: [[-85, -180], [85, 180]],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);
} else {
  document.querySelector("#map-unavailable").hidden = false;
}

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

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function directRoutePoints(origin, destination, segments = 32) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const vector = ({ latitude, longitude }) => {
    const lat = radians(latitude);
    const lon = radians(longitude);
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  };
  const start = vector(origin);
  const end = vector(destination);
  const dot = Math.max(-1, Math.min(1, start.reduce((sum, value, index) => sum + value * end[index], 0)));
  const angle = Math.acos(dot);
  const sinAngle = Math.sin(angle);
  const points = [];

  for (let step = 0; step <= segments; step += 1) {
    const fraction = step / segments;
    const left = sinAngle === 0 ? 1 - fraction : Math.sin((1 - fraction) * angle) / sinAngle;
    const right = sinAngle === 0 ? fraction : Math.sin(fraction * angle) / sinAngle;
    const x = left * start[0] + right * end[0];
    const y = left * start[1] + right * end[1];
    const z = left * start[2] + right * end[2];
    const latitude = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    const longitude = Math.atan2(y, x) * 180 / Math.PI;
    points.push([latitude, longitude]);
  }

  return points;
}

function markerColor(result) {
  if (result.score === "buy") return "#e89642";
  if (["excellent", "good"].includes(result.score)) return "#2b9b77";
  return "#087e85";
}

function markerStyle(result) {
  const selected = selectedDestination === result.destinationCode;
  return {
    radius: selected ? 9 : 7,
    color: "#ffffff",
    weight: selected ? 3 : 2,
    fillColor: markerColor(result),
    fillOpacity: 1,
  };
}

function popupMarkup(result) {
  const airportName = AIRPORTS[result.destinationCode]?.name ?? result.destination;
  const routeKind = result.direct ? "직항" : "경유";
  return `<div class="map-popup">
    <strong>${escapeHTML(result.destination)} · ${escapeHTML(result.destinationCode)}</strong>
    <span>${escapeHTML(airportName)}</span>
    <span>${escapeHTML(result.airlineName)} · ${routeKind}</span>
    <b>왕복 ${formatWon(result.currentPrice)}</b>
    <small>예시 데이터 · 실시간 아님</small>
  </div>`;
}

function updateMapSelection() {
  for (const [destinationCode, marker] of mapMarkers) {
    const result = currentResults.find((item) => item.destinationCode === destinationCode);
    if (result) marker.setStyle(markerStyle(result));
  }
}

function renderMap(results) {
  if (!map || !routeLayer || !markerLayer) return;
  routeLayer.clearLayers();
  markerLayer.clearLayers();
  mapMarkers.clear();

  const origin = results.length ? AIRPORTS[results[0].originCode] : null;
  if (origin) {
    const originMarker = window.L.circleMarker([origin.latitude, origin.longitude], {
      className: "kaf-origin-marker",
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: "#24485a",
      fillOpacity: 1,
    })
      .bindPopup(`<strong>${escapeHTML(origin.name)} · ICN</strong><br><small>출발지 예시</small>`)
      .bindTooltip("출발 · ICN")
      .addTo(markerLayer);
    originMarker.getElement()?.setAttribute("aria-label", `출발지 예시 · ${origin.name} · ICN`);
  }

  for (const result of results) {
    const destination = AIRPORTS[result.destinationCode];
    if (!destination) continue;

    if (result.direct && origin) {
      window.L.polyline(directRoutePoints(origin, destination), {
        className: "kaf-direct-route",
        color: markerColor(result),
        weight: 2,
        opacity: 0.72,
      }).addTo(routeLayer);
    }

    const marker = window.L.circleMarker([destination.latitude, destination.longitude], {
      ...markerStyle(result),
      className: "kaf-destination-marker",
    })
      .bindTooltip(`${escapeHTML(result.destination)} · ${escapeHTML(result.destinationCode)}`)
      .bindPopup(popupMarkup(result))
      .addTo(markerLayer);
    marker.on("click", () => {
      selectedDestination = result.destinationCode;
      renderLists(currentResults);
      updateMapSelection();
    });
    marker.getElement()?.setAttribute(
      "aria-label",
      `${result.destination} · ${result.destinationCode} · ${result.airlineName} · ${result.direct ? "직항" : "경유"} · 예시 운임 ${formatWon(result.currentPrice)}`,
    );
    marker.getElement()?.setAttribute("data-map-destination", result.destinationCode);
    mapMarkers.set(result.destinationCode, marker);
  }
}

function updateSelection(destinationCode) {
  selectedDestination = destinationCode;
  renderLists(currentResults);
  updateMapSelection();
}

function renderLists(results) {
  list.innerHTML = results.map(cardMarkup).join("");
  resultCount.textContent = `${results.length}곳`;
  emptyState.hidden = results.length !== 0;
  list.hidden = results.length === 0;

  for (const element of list.querySelectorAll("[data-destination]")) {
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
    renderMap(currentResults);
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
  renderMap(currentResults);
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
if (map) window.setTimeout(() => map.invalidateSize(), 0);
void runSearch();
