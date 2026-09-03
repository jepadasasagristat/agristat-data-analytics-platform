/* AgriStat crop dashboards — config from window.DASHBOARD_CONFIG in each HTML page */

const fmt = {
  compact(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-PH", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(n);
  },
  number(n, digits = 0) {
    if (n == null || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-PH", {
      maximumFractionDigits: digits,
    }).format(n);
  },
  /** Format number; returns display text, raw (non-compact) text, and whether compact was used. */
  scoreDetail(n, { compact = true } = {}) {
    if (n == null || Number.isNaN(n)) {
      return { text: "—", raw: null, compact: false };
    }
    const num = Number(n);
    const abs = Math.abs(num);
    const useCompact = compact && abs >= 1000;
    const format = (useCompactNotation) => {
      let formatted = new Intl.NumberFormat("en-PH", {
        notation: useCompactNotation ? "compact" : "standard",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
      return formatted.replace(/\.00(?=[A-Za-z\u00A0\s]|$)/, "");
    };
    return {
      text: format(useCompact),
      raw: format(false),
      compact: useCompact,
    };
  },
  /** Scorecard values: 2 decimals, omit trailing .00 */
  score(n, opts) {
    return fmt.scoreDetail(n, opts).text;
  },
  pct(n) {
    if (n == null || Number.isNaN(n)) return "No YoY";
    const sign = n > 0 ? "+" : "";
    return `${sign}${fmt.score(n, { compact: false })}% YoY`;
  },
};

function resolveDashboardConfig() {
  const provided = window.DASHBOARD_CONFIG;
  if (provided?.mode === "multiCrop" && provided.dataset) {
    return {
      groupLabel: "Fruit",
      groupNoun: "fruit",
      groupPlural: "fruits",
      groupAllLabel: "All fruits",
      subtypeLabel: "Variety",
      subtypeNoun: "variety",
      subtypePlural: "varieties",
      subtypeAllLabel: "All varieties",
      subtypes: [],
      defaultCrops: "all",
      chartSeriesLimit: 12,
      seriesSplit: "crop_group",
      ...provided,
    };
  }
  if (provided && provided.cropGroup && Array.isArray(provided.subtypes) && provided.subtypes.length >= 2) {
    return {
      dataset: "palay_corn",
      mode: "binary",
      seriesSplit: "crop_subtype",
      ...provided,
    };
  }
  const path = (window.location.pathname || "").toLowerCase();
  if (path.includes("/fruits")) {
    return {
      dataset: "fruits",
      mode: "multiCrop",
      cropGroup: null,
      slug: "fruits",
      title: "Fruit Crops Production Dashboard",
      groupLabel: "Fruit",
      groupNoun: "fruit",
      groupPlural: "fruits",
      groupAllLabel: "All fruits",
      subtypeLabel: "Variety",
      subtypeNoun: "variety",
      subtypePlural: "varieties",
      subtypeAllLabel: "All varieties",
      seriesSplit: "crop_group",
      showAreaYield: false,
      showSubtypeAverages: false,
      priorityCropTopN: 3,
      defaultCrops: "all",
      chartSeriesLimit: 12,
      subtypes: [],
    };
  }
  if (path.includes("/vegetables")) {
    return {
      dataset: "vegetables",
      mode: "multiCrop",
      cropGroup: null,
      slug: "vegetables",
      title: "Vegetables and Root Crops Production Dashboard",
      groupLabel: "Vegetable",
      groupNoun: "vegetable",
      groupPlural: "vegetables",
      groupAllLabel: "All vegetables",
      subtypeLabel: "Variety",
      subtypeNoun: "variety",
      subtypePlural: "varieties",
      subtypeAllLabel: "All varieties",
      seriesSplit: "crop_group",
      showAreaYield: false,
      showSubtypeAverages: false,
      priorityCropTopN: 3,
      defaultCrops: "all",
      chartSeriesLimit: 12,
      subtypes: [],
    };
  }
  if (path.includes("/corn")) {
    return {
      dataset: "palay_corn",
      mode: "binary",
      seriesSplit: "crop_subtype",
      cropGroup: "Corn",
      slug: "corn",
      title: "Corn Production Dashboard",
      subtypeLabel: "Variety",
      subtypeNoun: "variety",
      subtypePlural: "varieties",
      subtypeAllLabel: "All varieties",
      subtypes: [
        { value: "Yellow", label: "Yellow", color: "#09663f" },
        { value: "White", label: "White", color: "#9ae856" },
      ],
    };
  }
  return {
    dataset: "palay_corn",
    mode: "binary",
    seriesSplit: "crop_subtype",
    cropGroup: "Palay",
    slug: "palay",
    title: "Palay Production Dashboard",
    subtypeLabel: "Ecosystem",
    subtypeNoun: "ecosystem",
    subtypePlural: "ecosystems",
    subtypeAllLabel: "All ecosystems",
    subtypes: [
      { value: "Irrigated", label: "Irrigated", color: "#09663f" },
      { value: "Rainfed", label: "Rainfed", color: "#9ae856" },
    ],
  };
}

const CONFIG = resolveDashboardConfig();
const IS_MULTI_CROP = CONFIG.mode === "multiCrop";
const DATASET = CONFIG.dataset || "palay_corn";
const CROP_PALETTE = [
  "#09663f",
  "#9ae856",
  "#0a7a4b",
  "#c4e87a",
  "#06402b",
  "#5cb85c",
  "#2e7d32",
  "#aed581",
  "#81c784",
  "#33691e",
];

let SUBTYPE_VALUES = (CONFIG.subtypes || []).map((s) => s.value);
let latestPriorityCropGroups = [];
let SUBTYPE_A = CONFIG.subtypes?.[0] || { value: "", label: "—", color: CROP_PALETTE[0] };
let SUBTYPE_B = CONFIG.subtypes?.[1] || { value: "", label: "—", color: CROP_PALETTE[1] };

function pairSubtypeValues() {
  return [SUBTYPE_A.value, SUBTYPE_B.value].filter(Boolean);
}

function seriesDimLabel() {
  if (CONFIG.seriesSplit === "crop_group") {
    return CONFIG.groupLabel || CONFIG.subtypeLabel || "Fruit";
  }
  return CONFIG.subtypeLabel || "Variety";
}

function seriesDimNoun() {
  if (CONFIG.seriesSplit === "crop_group") {
    return CONFIG.groupNoun || CONFIG.subtypeNoun || "fruit";
  }
  return CONFIG.subtypeNoun || "variety";
}

function filterDimLabel() {
  if (IS_MULTI_CROP) return CONFIG.groupLabel || CONFIG.subtypeLabel || "Fruit";
  return CONFIG.subtypeLabel || "Ecosystem";
}

function filterAllLabel() {
  if (IS_MULTI_CROP) {
    return CONFIG.groupAllLabel || CONFIG.subtypeAllLabel || "All fruits";
  }
  return CONFIG.subtypeAllLabel || "All";
}

function defaultCropSelection(groups) {
  const all = groups || [];
  if (CONFIG.defaultCrops === "all" || CONFIG.defaultCrops == null) return [...all];
  if (Array.isArray(CONFIG.defaultCrops)) {
    const defaults = CONFIG.defaultCrops.filter((g) => all.includes(g));
    return defaults.length ? defaults : [...all];
  }
  return [...all];
}

function chartSeriesValues() {
  if (!IS_MULTI_CROP) return (CONFIG.subtypes || []).map((s) => s.value);
  const cropEl = document.getElementById("crop");
  const selected = checkedValues(cropEl);
  const all = (CONFIG.subtypes || []).map((s) => s.value);
  let names =
    !selected.length || selected.length === checkboxCount(cropEl)
      ? defaultCropSelection(all)
      : [...selected];
  const limit = CONFIG.chartSeriesLimit;
  if (limit && names.length > limit) {
    if (Array.isArray(ecosystemSeriesPoints) && ecosystemSeriesPoints.length) {
      const totals = new Map();
      for (const p of ecosystemSeriesPoints) {
        if (!names.includes(p.crop_subtype)) continue;
        totals.set(p.crop_subtype, (totals.get(p.crop_subtype) || 0) + (Number(p.volume_mt) || 0));
      }
      names = [...names].sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0));
    } else {
      const priority = (CONFIG.priorityCrops || latestPriorityCropGroups || []).filter((g) =>
        names.includes(g)
      );
      const rest = names.filter((g) => !priority.includes(g));
      names = [...priority, ...rest];
    }
    return names.slice(0, limit);
  }
  return names;
}

function syncSubtypePairUI() {
  const labelA = document.getElementById("subtypeLabelA");
  const labelB = document.getElementById("subtypeLabelB");
  if (labelA) labelA.textContent = SUBTYPE_A.label;
  if (labelB) labelB.textContent = SUBTYPE_B.label;
  const thA = document.getElementById("regionEcoThA");
  const thB = document.getElementById("regionEcoThB");
  if (thA) {
    thA.textContent = SUBTYPE_A.label;
    thA.title = `Sort by ${SUBTYPE_A.label}`;
  }
  if (thB) {
    thB.textContent = SUBTYPE_B.label;
    thB.title = `Sort by ${SUBTYPE_B.label}`;
  }
}

function setSubtypePairFromKpi(bySubtype) {
  if (!Array.isArray(bySubtype) || bySubtype.length < 2) return;
  const colorByValue = Object.fromEntries(
    (CONFIG.subtypes || []).map((s) => [s.value, s.color])
  );
  SUBTYPE_A = {
    value: bySubtype[0].crop_subtype,
    label: bySubtype[0].crop_subtype,
    color: colorByValue[bySubtype[0].crop_subtype] || CROP_PALETTE[0],
  };
  SUBTYPE_B = {
    value: bySubtype[1].crop_subtype,
    label: bySubtype[1].crop_subtype,
    color: colorByValue[bySubtype[1].crop_subtype] || CROP_PALETTE[1],
  };
  syncSubtypePairUI();
}

function ecosystemChartColors() {
  return Object.fromEntries(
    (CONFIG.subtypes || []).map((s) => [s.value, { bg: s.color, hover: s.color, border: s.color }])
  );
}

const els = {
  yearFrom: document.getElementById("yearFrom"),
  yearTo: document.getElementById("yearTo"),
  yearTooltip: document.getElementById("yearTooltip"),
  yearRangeTrack: document.getElementById("yearRangeTrack"),
  yearRangeScale: document.getElementById("yearRangeScale"),
  yearRangeCount: document.getElementById("yearRangeCount"),
  quarter: document.getElementById("quarter"),
  semester: document.getElementById("semester"),
  crop: document.getElementById("crop"),
  region: document.getElementById("region"),
  province: document.getElementById("province"),
  refreshBtn: document.getElementById("refreshBtn"),
  statusMeta: document.getElementById("statusMeta"),
  kpiVolume: document.getElementById("kpiVolume"),
  kpiArea: document.getElementById("kpiArea"),
  kpiYield: document.getElementById("kpiYield"),
  kpiVolumeHint: document.getElementById("kpiVolumeHint"),
  kpiAreaHint: document.getElementById("kpiAreaHint"),
  kpiIrrigated: document.getElementById("kpiIrrigated"),
  kpiRainfed: document.getElementById("kpiRainfed"),
  kpiIrrigatedShare: document.getElementById("kpiIrrigatedShare"),
  kpiRainfedShare: document.getElementById("kpiRainfedShare"),
  subtypeBarIrrigated: document.getElementById("subtypeBarIrrigated"),
  subtypeBarRainfed: document.getElementById("subtypeBarRainfed"),
  subtypeBarHint: document.getElementById("subtypeBarHint"),
  cmpVolume2025: document.getElementById("cmpVolume2025"),
  cmpVolume2024: document.getElementById("cmpVolume2024"),
  cmpVariance: document.getElementById("cmpVariance"),
  cmpGrowth: document.getElementById("cmpGrowth"),
  cmpVarianceCard: document.getElementById("cmpVarianceCard"),
  cmpGrowthCard: document.getElementById("cmpGrowthCard"),
  trendChartSub: document.getElementById("trendChartSub"),
  volumeGrowthChartSub: document.getElementById("volumeGrowthChartSub"),
  yieldTrendChartSub: document.getElementById("yieldTrendChartSub"),
  ecosystemTrendTitle: document.getElementById("ecosystemTrendTitle"),
  ecosystemTrendChartSub: document.getElementById("ecosystemTrendChartSub"),
  ecosystemMetric: document.getElementById("ecosystemMetric"),
  ecosystemVolumeTableSub: document.getElementById("ecosystemVolumeTableSub"),
  ecosystemVolumeTableBody: document.getElementById("ecosystemVolumeTableBody"),
  regionVolumeTableSub: document.getElementById("regionVolumeTableSub"),
  regionVolumeTableBody: document.getElementById("regionVolumeTableBody"),
  regionEcosystemMetric: document.getElementById("regionEcosystemMetric"),
  regionEcosystemTableSub: document.getElementById("regionEcosystemTableSub"),
  regionEcosystemTableBody: document.getElementById("regionEcosystemTableBody"),
  provinceVolumeTableSub: document.getElementById("provinceVolumeTableSub"),
  provinceVolumeTableBody: document.getElementById("provinceVolumeTableBody"),
  provinceVolumeTableWrap: document.querySelector(".province-volume-table-wrap"),
  provinceVolumeTopN: document.getElementById("provinceVolumeTopN"),
  ecosystemVolumeTopN: document.getElementById("ecosystemVolumeTopN"),
  ecosystemVolumeTableWrap: document.querySelector(".ecosystem-volume-table-wrap"),
  filterSummaryChips: document.getElementById("filterSummaryChips"),
};

let trendChart;
let volumeGrowthChart;
let yieldTrendChart;
let ecosystemTrendChart;
let pollTimer;
let dashboardRefreshSeq = 0;
let syncingPeriodFilters = false;
let provinceMeta = [];
let ecosystemSeriesPoints = [];
let regionEcosystemRows = [];
let provinceComparePoints = [];
let ecoVolumePoints = [];
let regionVolumePoints = [];
let ecoVolumeLatestYear = null;
let regionVolumeLatestYear = null;
let dashboardSnapshot = null;
let latestAnalysisModel = null;
const PROVINCE_VOLUME_TOP_N_DEFAULT = 10;
const PROVINCE_VOLUME_SCROLL_AT = 15;
const ECOSYSTEM_VOLUME_TOP_N_DEFAULT = 10;
const ECOSYSTEM_VOLUME_SCROLL_AT = 10;
const tableSortState = {
  ecosystemVolume: { key: IS_MULTI_CROP ? "latest" : "name", dir: IS_MULTI_CROP ? "desc" : "asc" },
  regionVolume: { key: "latest", dir: "desc" },
  regionEcosystem: { key: "total", dir: "desc" },
  provinceVolume: { key: "latest", dir: "desc" },
};
let yearBounds = { min: 1990, max: 2026 };
let yearRefreshTimer = null;
let activeYearThumb = "to";

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v == null || v === "") return;
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, item));
    else sp.set(k, v);
  });
  return sp.toString();
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const payload = JSON.parse(text);
          if (payload?.detail) {
            message =
              typeof payload.detail === "string"
                ? payload.detail
                : JSON.stringify(payload.detail);
          } else {
            message = text.slice(0, 180);
          }
        } catch {
          message = text.slice(0, 180);
        }
      }
    } catch {
      /* keep statusText */
    }
    throw new Error(message);
  }
  return res.json();
}

function checkedValues(groupEl) {
  if (!groupEl) return [];
  return [...groupEl.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
}

function checkboxCount(groupEl) {
  if (!groupEl) return 0;
  return groupEl.querySelectorAll('input[type="checkbox"]').length;
}

function isPartialMultiSelect(groupEl) {
  const total = checkboxCount(groupEl);
  const selected = checkedValues(groupEl).length;
  return total > 0 && selected > 0 && selected < total;
}

function syncMultiSelectSummary(groupEl) {
  if (!groupEl) return;
  const summary = groupEl.querySelector(".multi-select-summary");
  if (!summary) return;
  const allLabel = groupEl.dataset.allLabel || "All";
  const boxes = [...groupEl.querySelectorAll('input[type="checkbox"]')];
  const selected = boxes.filter((b) => b.checked);
  if (selected.length === boxes.length) {
    summary.textContent = allLabel;
    return;
  }
  if (!selected.length) {
    summary.textContent = groupEl.id === "crop" ? `None selected · ${allLabel}` : allLabel;
    return;
  }
  summary.textContent = `${selected.length} selected`;
}

function setMultiSelectOpen(groupEl, open) {
  if (!groupEl) return;
  const panel = groupEl.querySelector(".multi-select-panel");
  const toggle = groupEl.querySelector(".multi-select-toggle");
  groupEl.classList.toggle("is-open", open);
  if (panel) panel.hidden = !open;
  if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open && isMultiSelectSearchable(groupEl)) {
    resetMultiSelectSearch(groupEl);
    const searchInput = groupEl.querySelector(".multi-select-search-input");
    requestAnimationFrame(() => searchInput?.focus());
  } else if (!open) {
    resetMultiSelectSearch(groupEl);
  }
}

function closeAllMultiSelects(exceptEl) {
  document.querySelectorAll(".multi-select.is-open").forEach((el) => {
    if (el !== exceptEl) setMultiSelectOpen(el, false);
  });
}

function setCheckedValues(groupEl, values) {
  if (!groupEl) return;
  const wanted = new Set(values.map(String));
  groupEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = wanted.has(input.value);
  });
  syncMultiSelectSummary(groupEl);
}

function multiSelectSearchHtml(placeholder = "Search…") {
  return `<div class="multi-select-search">
      <input type="search" class="multi-select-search-input" placeholder="${escapeAttr(
        placeholder
      )}" aria-label="${escapeAttr(placeholder)}" autocomplete="off" />
    </div>`;
}

function multiSelectActionsHtml({ searchable = false, searchPlaceholder = "Search…" } = {}) {
  const search = searchable ? multiSelectSearchHtml(searchPlaceholder) : "";
  return `${search}<div class="multi-select-actions">
      <button type="button" class="multi-select-action" data-multi-action="select-all">Select all</button>
      <span class="multi-select-actions-sep" aria-hidden="true">·</span>
      <button type="button" class="multi-select-action" data-multi-action="clear">Deselect all</button>
    </div>`;
}

function isMultiSelectSearchable(groupEl) {
  return groupEl?.dataset?.searchable === "true";
}

function multiSelectSearchPlaceholder(groupEl) {
  return groupEl?.dataset?.searchPlaceholder || "Search…";
}

function filterMultiSelectOptions(groupEl, query) {
  if (!groupEl) return;
  const panel = groupEl.querySelector(".multi-select-panel");
  if (!panel) return;
  const q = String(query || "")
    .trim()
    .toLowerCase();
  let visible = 0;
  panel.querySelectorAll(".multi-select-option").forEach((opt) => {
    const text = (opt.textContent || "").trim().toLowerCase();
    const show = !q || text.includes(q);
    opt.hidden = !show;
    if (show) visible += 1;
  });
  let empty = panel.querySelector(".multi-select-empty");
  if (!empty) {
    empty = document.createElement("div");
    empty.className = "multi-select-empty";
    empty.textContent = "No matches";
    panel.appendChild(empty);
  }
  empty.hidden = !q || visible > 0;
}

function resetMultiSelectSearch(groupEl) {
  if (!groupEl || !isMultiSelectSearchable(groupEl)) return;
  const input = groupEl.querySelector(".multi-select-search-input");
  if (input) input.value = "";
  filterMultiSelectOptions(groupEl, "");
}

function checkAllValues(groupEl, { visibleOnly = false } = {}) {
  if (!groupEl) return;
  groupEl.querySelectorAll(".multi-select-option").forEach((opt) => {
    if (visibleOnly && opt.hidden) return;
    const input = opt.querySelector('input[type="checkbox"]');
    if (input) input.checked = true;
  });
  syncMultiSelectSummary(groupEl);
}

function clearAllValues(groupEl, { visibleOnly = false } = {}) {
  if (!groupEl) return;
  groupEl.querySelectorAll(".multi-select-option").forEach((opt) => {
    if (visibleOnly && opt.hidden) return;
    const input = opt.querySelector('input[type="checkbox"]');
    if (input) input.checked = false;
  });
  syncMultiSelectSummary(groupEl);
}

function ensureAtLeastOne(groupEl) {
  // Empty selection is treated as "all" in the filter params and summary label.
  syncMultiSelectSummary(groupEl);
}

function fillMultiSelectOptions(groupEl, values, { preserve = true, checkAll = true } = {}) {
  if (!groupEl) return;
  const panel = groupEl.querySelector(".multi-select-panel");
  if (!panel) return;
  const previous = preserve ? new Set(checkedValues(groupEl)) : new Set();
  const hadPrevious = previous.size > 0;
  const searchable = isMultiSelectSearchable(groupEl);
  const optionsHtml = values
    .map((value) => {
      const checked = checkAll && (!hadPrevious || previous.has(value));
      return `<label class="multi-select-option"><input type="checkbox" value="${escapeHtml(
        value
      )}"${checked ? " checked" : ""} /><span>${escapeHtml(value)}</span></label>`;
    })
    .join("");
  panel.innerHTML = `${multiSelectActionsHtml({
    searchable,
    searchPlaceholder: multiSelectSearchPlaceholder(groupEl),
  })}${optionsHtml}`;
  if (hadPrevious && !checkedValues(groupEl).length && checkAll) {
    checkAllValues(groupEl);
  } else {
    syncMultiSelectSummary(groupEl);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

let rawTipEl = null;
let rawTipAnchor = null;

function ensureRawTip() {
  if (rawTipEl) return rawTipEl;
  rawTipEl = document.createElement("div");
  rawTipEl.className = "raw-tip";
  rawTipEl.setAttribute("role", "tooltip");
  rawTipEl.hidden = true;
  document.body.appendChild(rawTipEl);
  return rawTipEl;
}

function positionRawTip(anchor) {
  const tip = ensureRawTip();
  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  let top = anchorRect.top - tipRect.height - 8;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  if (top < 8) top = anchorRect.bottom + 8;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function showRawTip(anchor, text) {
  if (!text) return;
  const tip = ensureRawTip();
  rawTipAnchor = anchor;
  tip.textContent = text;
  tip.hidden = false;
  tip.classList.remove("is-visible");
  positionRawTip(anchor);
  requestAnimationFrame(() => {
    if (rawTipAnchor !== anchor) return;
    positionRawTip(anchor);
    tip.classList.add("is-visible");
  });
}

function hideRawTip(anchor) {
  if (!rawTipEl || (anchor && rawTipAnchor !== anchor)) return;
  rawTipEl.classList.remove("is-visible");
  rawTipAnchor = null;
  window.setTimeout(() => {
    if (!rawTipEl.classList.contains("is-visible")) {
      rawTipEl.hidden = true;
      rawTipEl.textContent = "";
    }
  }, 120);
}

function setRawTip(el, text) {
  if (!el) return;
  if (!text) {
    el.removeAttribute("data-raw-tip");
    el.classList.remove("has-raw-tip");
    if (rawTipAnchor === el) hideRawTip(el);
    return;
  }
  el.setAttribute("data-raw-tip", text);
  el.classList.add("has-raw-tip");
}

function bindRawTips() {
  document.addEventListener(
    "mouseover",
    (event) => {
      const el = event.target.closest("[data-raw-tip]");
      if (!el) return;
      showRawTip(el, el.getAttribute("data-raw-tip"));
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (event) => {
      const el = event.target.closest("[data-raw-tip]");
      if (!el) return;
      const related = event.relatedTarget;
      if (related && el.contains(related)) return;
      hideRawTip(el);
    },
    true
  );

  window.addEventListener("scroll", () => {
    if (rawTipAnchor && rawTipEl?.classList.contains("is-visible")) {
      positionRawTip(rawTipAnchor);
    }
  }, true);

  window.addEventListener("resize", () => {
    if (rawTipAnchor && rawTipEl?.classList.contains("is-visible")) {
      positionRawTip(rawTipAnchor);
    }
  });
}

function cropParams() {
  if (IS_MULTI_CROP) {
    const selected = checkedValues(els.crop);
    const total = checkboxCount(els.crop);
    const params = {};
    if (selected.length > 0 && total > 0 && selected.length < total) {
      params.crop_group = selected;
    }
    return params;
  }
  const selected = checkedValues(els.crop);
  const params = { crop_group: CONFIG.cropGroup };
  if (selected.length && selected.length < checkboxCount(els.crop)) {
    params.crop_subtype = selected;
  }
  return params;
}

function isCropFilterNarrowed() {
  if (!IS_MULTI_CROP || !els.crop) return false;
  const total = checkboxCount(els.crop);
  const selected = checkedValues(els.crop);
  return total > 0 && selected.length > 0 && selected.length < total;
}

function selectedCropFilterValues() {
  if (!isCropFilterNarrowed()) return [];
  return checkedValues(els.crop);
}

function filterSeriesPointsByCrop(points) {
  const allowed = selectedCropFilterValues();
  if (!allowed.length) return points || [];
  const set = new Set(allowed);
  return (points || []).filter((p) => set.has(p.crop_subtype));
}

function multiFilterParams() {
  const quarters = checkedValues(els.quarter).map(Number);
  const semesters = checkedValues(els.semester).map(Number);
  const params = {};
  if (quarters.length && quarters.length < checkboxCount(els.quarter)) params.quarter = quarters;
  if (semesters.length && semesters.length < checkboxCount(els.semester)) params.semester = semesters;
  return params;
}

const QUARTERS_BY_SEMESTER = {
  1: ["1", "2"],
  2: ["3", "4"],
};
const SEMESTER_BY_QUARTER = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
};

function allQuarterValues() {
  return ["1", "2", "3", "4"];
}

function allSemesterValues() {
  return ["1", "2"];
}

function isFullPeriodSelection(values, total) {
  return total > 0 && values.length === total;
}

function semestersForQuarters(quarters) {
  const ids = new Set();
  for (const quarter of quarters) {
    const semester = SEMESTER_BY_QUARTER[quarter];
    if (semester) ids.add(String(semester));
  }
  return [...ids].sort();
}

function quartersForSemesters(semesters) {
  const ids = new Set();
  for (const semester of semesters) {
    for (const quarter of QUARTERS_BY_SEMESTER[semester] || []) ids.add(quarter);
  }
  return [...ids].sort();
}

/** Keep quarter and semester filters aligned (S1=Q1–Q2, S2=Q3–Q4). */
function syncPeriodFilters(changed) {
  if (!els.quarter || !els.semester || syncingPeriodFilters) return;
  syncingPeriodFilters = true;
  try {
    if (changed === "quarter") {
      const selected = checkedValues(els.quarter).map(Number);
      const total = checkboxCount(els.quarter);
      let next;
      if (isFullPeriodSelection(selected, total)) next = allSemesterValues();
      else if (!selected.length) next = [];
      else next = semestersForQuarters(selected);
      setCheckedValues(els.semester, next);
      syncMultiSelectSummary(els.semester);
    } else if (changed === "semester") {
      const selected = checkedValues(els.semester).map(Number);
      const total = checkboxCount(els.semester);
      let next;
      if (isFullPeriodSelection(selected, total)) next = allQuarterValues();
      else if (!selected.length) next = [];
      else next = quartersForSemesters(selected);
      setCheckedValues(els.quarter, next);
      syncMultiSelectSummary(els.quarter);
    }
  } finally {
    syncingPeriodFilters = false;
  }
}

function geoParams() {
  const regions = checkedValues(els.region);
  const provinces = checkedValues(els.province);
  const params = {};
  if (regions.length && regions.length < checkboxCount(els.region)) params.region = regions;
  if (provinces.length && provinces.length < checkboxCount(els.province)) params.province = provinces;
  return params;
}

function defaultYearTo() {
  const previousYear = new Date().getFullYear() - 1;
  return Math.max(yearBounds.min, Math.min(yearBounds.max, previousYear));
}

function getYearRange() {
  let from = Number(els.yearFrom.value);
  let to = Number(els.yearTo.value);
  if (from > to) [from, to] = [to, from];
  return { year_from: from, year_to: to };
}

function syncYearRangeUI() {
  const { year_from, year_to } = getYearRange();
  const min = Number(els.yearFrom.min);
  const max = Number(els.yearFrom.max);
  const span = Math.max(max - min, 1);
  const startPct = ((year_from - min) / span) * 100;
  const endPct = ((year_to - min) / span) * 100;

  if (els.yearRangeTrack) {
    els.yearRangeTrack.style.setProperty("--range-start", `${startPct}%`);
    els.yearRangeTrack.style.setProperty("--range-span", `${Math.max(endPct - startPct, 0)}%`);
  }

  if (els.yearTooltip) {
    els.yearTooltip.textContent =
      year_from === year_to ? String(year_from) : `${year_from} – ${year_to}`;
    els.yearTooltip.style.left = "";
  }

  els.yearFrom.style.zIndex = year_from >= year_to - 1 ? "5" : "3";
  els.yearTo.style.zIndex = "4";
  els.yearFrom.classList.toggle("is-active", activeYearThumb === "from");
  els.yearTo.classList.toggle("is-active", activeYearThumb === "to");

  const yearCount = year_to - year_from + 1;
  const isDefaultRange = year_from === yearBounds.min && year_to === defaultYearTo();
  if (els.yearRangeCount) {
    els.yearRangeCount.textContent = isDefaultRange
      ? "All years"
      : yearCount === 1
        ? "1 year"
        : `${yearCount} years`;
  }
}

function buildYearScale() {
  const host = els.yearRangeScale;
  if (!host) return;
  const min = yearBounds.min;
  const max = yearBounds.max;
  const span = Math.max(max - min, 1);
  const steps = 4;
  const labels = [];
  for (let i = 0; i <= steps; i += 1) {
    const year = Math.round(min + (span * i) / steps);
    const pct = ((year - min) / span) * 100;
    const edge = i === 0 ? " is-start" : i === steps ? " is-end" : "";
    labels.push(
      `<span class="year-scale-label${edge}" style="left:${pct}%">${year}</span>`
    );
  }
  host.innerHTML = labels.join("");
}

function setYearRange(from, to, { silent = false } = {}) {
  const min = yearBounds.min;
  const max = yearBounds.max;
  let yFrom = Math.min(Math.max(Number(from), min), max);
  let yTo = Math.min(Math.max(Number(to), min), max);
  if (yFrom > yTo) [yFrom, yTo] = [yTo, yFrom];
  els.yearFrom.min = String(min);
  els.yearFrom.max = String(max);
  els.yearTo.min = String(min);
  els.yearTo.max = String(max);
  els.yearFrom.value = String(yFrom);
  els.yearTo.value = String(yTo);
  syncYearRangeUI();
  if (!silent) markActiveFilterIcons();
}

function commonParams(extra = {}) {
  const params = {
    dataset: DATASET,
    ...getYearRange(),
    ...multiFilterParams(),
    ...geoParams(),
    ...cropParams(),
    ...extra,
  };
  if (IS_MULTI_CROP) {
    params.split_by = CONFIG.seriesSplit || "crop_group";
  }
  return params;
}

function selectedRegions() {
  const selected = checkedValues(els.region);
  const total = checkboxCount(els.region);
  if (!selected.length || selected.length === total) return [];
  return selected;
}

function populateRegions(regions) {
  fillMultiSelectOptions(els.region, regions || [], { preserve: false, checkAll: true });
}

function populateProvinces(preserveSelection = true) {
  const regions = selectedRegions();
  const options = provinceMeta
    .filter((p) => !regions.length || regions.includes(p.region))
    .map((p) => p.province)
    .slice()
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  fillMultiSelectOptions(els.province, options, {
    preserve: preserveSelection,
    checkAll: true,
  });
}

function pctChange(from, to) {
  if (from == null || to == null || Number.isNaN(from) || Number.isNaN(to) || from === 0) {
    return null;
  }
  return ((to - from) / Math.abs(from)) * 100;
}

function describeChange(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  const abs = Math.abs(pct);
  const amount = fmt.score(abs, { compact: false });
  if (abs < 0.05) return "held nearly steady";
  if (pct > 0) return abs >= 20 ? `rose sharply by ${amount}%` : `rose by ${amount}%`;
  return abs >= 20 ? `fell sharply by ${amount}%` : `fell by ${amount}%`;
}

const VOLUME_GROWTH_FIRST_YEAR = 2011;

function volumeGrowthEndYear() {
  return defaultYearTo();
}

function buildVolumeYoYGrowth(points) {
  const { year_from, year_to } = getYearRange();
  const endYear = Math.min(year_to, volumeGrowthEndYear());
  const byYear = new Map();
  for (const p of points || []) {
    const year = Number(p.year);
    if (!Number.isFinite(year)) continue;
    const volume = p.volume_mt;
    if (volume == null || Number.isNaN(Number(volume))) continue;
    byYear.set(year, Number(volume));
  }

  const labels = [];
  const values = [];
  const currentVolumes = [];
  const previousVolumes = [];
  const variances = [];
  for (let year = VOLUME_GROWTH_FIRST_YEAR; year <= endYear; year += 1) {
    if (year < year_from) continue;
    const current = byYear.get(year);
    const previous = byYear.get(year - 1);
    if (current == null) continue;
    labels.push(year);
    currentVolumes.push(current);
    previousVolumes.push(previous == null ? null : previous);
    variances.push(
      previous == null ? null : current - previous
    );
    if (previous == null || previous === 0) {
      values.push(null);
    } else {
      values.push(((current - previous) / Math.abs(previous)) * 100);
    }
  }
  return { labels, values, currentVolumes, previousVolumes, variances };
}

function buildVolumeGrowthSummary(labels, values) {
  const pairs = (labels || [])
    .map((year, i) => ({ year, growth: values[i] }))
    .filter((row) => row.growth != null && !Number.isNaN(row.growth));
  if (!pairs.length) {
    return "No year-on-year growth data available for the current filters.";
  }

  const latest = pairs[pairs.length - 1];
  const latestText = describeChange(latest.growth);
  const parts = [
    `Through ${latest.year}, volume ${latestText || "changed"} versus the prior year.`,
  ];

  let peak = pairs[0];
  let trough = pairs[0];
  for (const row of pairs) {
    if (row.growth > peak.growth) peak = row;
    if (row.growth < trough.growth) trough = row;
  }
  if (peak.year !== latest.year) {
    parts.push(
      `Strongest growth was in ${peak.year} (${fmt.score(peak.growth, { compact: false })}%).`
    );
  }
  if (trough.year !== latest.year && trough.growth < 0) {
    parts.push(
      `Sharpest decline was in ${trough.year} (${fmt.score(trough.growth, { compact: false })}%).`
    );
  }
  return parts.slice(0, 3).join(" ");
}

function growthBarColors(values, { hover = false, peakIndex = -1, lowIndex = -1 } = {}) {
  const hasExtremum = peakIndex >= 0 || lowIndex >= 0;
  return (values || []).map((v, i) => {
    const isExtremum = i === peakIndex || i === lowIndex;
    if (v == null || Number.isNaN(v)) {
      return hover ? "rgba(95, 115, 95, 0.45)" : "rgba(95, 115, 95, 0.28)";
    }

    let color;
    if (v > 0.05) color = hover ? "#146334" : "#1b7a3d";
    else if (v < -0.05) color = hover ? "#a51f1f" : "#c62828";
    else color = hover ? "#6f7f6f" : "#8a9a8a";

    if (hasExtremum && !isExtremum) {
      if (v > 0.05) return hover ? "rgba(20, 99, 52, 0.82)" : "rgba(27, 122, 61, 0.72)";
      if (v < -0.05) return hover ? "rgba(165, 31, 31, 0.82)" : "rgba(198, 40, 40, 0.72)";
      return hover ? "rgba(111, 127, 111, 0.82)" : "rgba(138, 154, 138, 0.72)";
    }
    return color;
  });
}

function renderVolumeGrowthChart(points) {
  if (!volumeGrowthChart) return;
  const { labels, values, currentVolumes, previousVolumes, variances } =
    buildVolumeYoYGrowth(points);
  const peakIndex = peakValueIndex(values);
  const lowIndex = lowValueIndex(values);
  volumeGrowthChart.$growthExtrasReady = prefersReducedMotion();
  volumeGrowthChart.data.labels = labels;
  volumeGrowthChart.data.datasets = [
    {
      type: "bar",
      label: "YoY growth rate",
      data: values,
      backgroundColor: growthBarColors(values, { peakIndex, lowIndex }),
      hoverBackgroundColor: growthBarColors(values, { hover: true, peakIndex, lowIndex }),
      borderWidth: 0,
      borderRadius: 0,
      borderSkipped: false,
      maxBarThickness: 34,
      categoryPercentage: 0.76,
      barPercentage: 0.86,
      peakIndex,
      lowIndex,
      currentVolumes,
      previousVolumes,
      variances,
    },
  ];
  // Full entrance animation (not the short "active" transition)
  volumeGrowthChart.update();
  if (els.volumeGrowthChartSub) {
    els.volumeGrowthChartSub.textContent = buildVolumeGrowthSummary(labels, values);
  }
}

function buildTrendSummary(points) {
  if (!points || !points.length) {
    return "No annual data available for the current filters.";
  }
  const volumeOnly = CONFIG.showAreaYield === false;
  if (points.length === 1) {
    const p = points[0];
    if (volumeOnly) {
      return `Showing ${p.year} only: volume ${fmt.score(p.volume_mt)} MT. Expand the year range to compare trends.`;
    }
    return `Showing ${p.year} only: volume ${fmt.score(p.volume_mt)} MT on ${fmt.score(p.area_ha)} ha harvested. Expand the year range to compare trends.`;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const volPct = pctChange(first.volume_mt, last.volume_mt);
  const areaPct = volumeOnly ? null : pctChange(first.area_ha, last.area_ha);
  const volText = describeChange(volPct);
  const areaText = volumeOnly ? null : describeChange(areaPct);

  let peak = points[0];
  for (const p of points) {
    if ((p.volume_mt ?? -Infinity) > (peak.volume_mt ?? -Infinity)) peak = p;
  }

  const parts = [];
  if (volumeOnly) {
    parts.push(
      `From ${first.year} to ${last.year}, production volume ${volText || "changed"}.`
    );
  } else {
    parts.push(
      `From ${first.year} to ${last.year}, production volume ${volText || "changed"} while area harvested ${areaText || "changed"}.`
    );
  }

  if (peak && peak.year !== last.year) {
    parts.push(`Peak volume was in ${peak.year} (${fmt.score(peak.volume_mt)} MT).`);
  } else if (peak && peak.year === last.year) {
    parts.push(`The latest year (${last.year}) is also the peak volume in this range.`);
  }

  if (points.length >= 4) {
    const recent = points.slice(-3);
    const prior = points.slice(-6, -3);
    if (prior.length === 3) {
      const recentAvg =
        recent.reduce((s, p) => s + (p.volume_mt || 0), 0) / recent.length;
      const priorAvg = prior.reduce((s, p) => s + (p.volume_mt || 0), 0) / prior.length;
      const recentPct = pctChange(priorAvg, recentAvg);
      const recentText = describeChange(recentPct);
      if (recentText) {
        parts.push(`In the latest 3 years versus the prior 3, average volume ${recentText}.`);
      }
    }
  }

  if (!volumeOnly && volPct != null && areaPct != null && Math.abs(volPct - areaPct) >= 5) {
    if (volPct > areaPct) {
      parts.push("Volume outpaced area, pointing to higher average yields over the period.");
    } else {
      parts.push("Area grew faster than volume, suggesting softer average yields over the period.");
    }
  }

  return parts.slice(0, 3).join(" ");
}

function yieldForPoint(p) {
  if (p.yield_mt_ha != null && !Number.isNaN(p.yield_mt_ha)) return p.yield_mt_ha;
  if (p.area_ha && p.area_ha > 0) return p.volume_mt / p.area_ha;
  return null;
}

function buildYieldTrendSummary(points) {
  const yieldPoints = (points || [])
    .map((p) => ({ year: p.year, yield_mt_ha: yieldForPoint(p) }))
    .filter((p) => p.yield_mt_ha != null && !Number.isNaN(p.yield_mt_ha));

  if (!yieldPoints.length) {
    return "No yield data available for the current filters.";
  }
  if (yieldPoints.length === 1) {
    const p = yieldPoints[0];
    return `Showing ${p.year} only: yield ${fmt.score(p.yield_mt_ha, { compact: false })} MT/ha. Expand the year range to compare yield trends.`;
  }

  const first = yieldPoints[0];
  const last = yieldPoints[yieldPoints.length - 1];
  const changePct = pctChange(first.yield_mt_ha, last.yield_mt_ha);
  const changeText = describeChange(changePct);

  let peak = yieldPoints[0];
  let low = yieldPoints[0];
  for (const p of yieldPoints) {
    if (p.yield_mt_ha > peak.yield_mt_ha) peak = p;
    if (p.yield_mt_ha < low.yield_mt_ha) low = p;
  }

  const parts = [];
  parts.push(
    `From ${first.year} to ${last.year}, average yield ${changeText || "changed"} (${fmt.score(
      first.yield_mt_ha,
      { compact: false }
    )} to ${fmt.score(last.yield_mt_ha, { compact: false })} MT/ha).`
  );

  if (peak.year !== last.year) {
    parts.push(
      `Highest yield was in ${peak.year} at ${fmt.score(peak.yield_mt_ha, { compact: false })} MT/ha.`
    );
  } else {
    parts.push(
      `The latest year (${last.year}) also marks the highest yield in this range.`
    );
  }

  if (yieldPoints.length >= 4) {
    const recent = yieldPoints.slice(-3);
    const prior = yieldPoints.slice(-6, -3);
    if (prior.length === 3) {
      const recentAvg = recent.reduce((s, p) => s + p.yield_mt_ha, 0) / recent.length;
      const priorAvg = prior.reduce((s, p) => s + p.yield_mt_ha, 0) / prior.length;
      const recentText = describeChange(pctChange(priorAvg, recentAvg));
      if (recentText) {
        parts.push(`In the latest 3 years versus the prior 3, average yield ${recentText}.`);
      }
    }
  } else if (low.year !== peak.year) {
    parts.push(
      `Lowest yield was in ${low.year} at ${fmt.score(low.yield_mt_ha, { compact: false })} MT/ha.`
    );
  }

  return parts.slice(0, 3).join(" ");
}

const ECOSYSTEM_METRICS = {
  yield_mt_ha: {
    get title() {
      return `Annual Yield Trend by ${seriesDimLabel()}`;
    },
    label: "Yield",
    unit: "MT/ha",
    compact: false,
  },
  volume_mt: {
    get title() {
      return `Annual Production Volume by ${seriesDimLabel()}`;
    },
    label: "Production volume",
    unit: "MT",
    compact: true,
  },
  area_ha: {
    get title() {
      return `Annual Area Harvested by ${seriesDimLabel()}`;
    },
    label: "Area harvested",
    unit: "ha",
    compact: true,
  },
};

function getEcosystemMetric() {
  const key = els.ecosystemMetric?.value || "yield_mt_ha";
  return ECOSYSTEM_METRICS[key] ? key : "yield_mt_ha";
}

function ecosystemMetricValue(row, metricKey) {
  if (metricKey === "yield_mt_ha") return yieldForPoint(row);
  const value = row?.[metricKey];
  return value == null || Number.isNaN(value) ? null : value;
}

function buildEcosystemTrendSummary(points, metricKey) {
  const meta = ECOSYSTEM_METRICS[metricKey] || ECOSYSTEM_METRICS.yield_mt_ha;
  const years = [...new Set((points || []).map((p) => p.year))].sort((a, b) => a - b);
  if (!years.length) {
    return `No ${meta.label.toLowerCase()} data by ${seriesDimNoun()} for the current filters.`;
  }

  const seriesNames = IS_MULTI_CROP ? chartSeriesValues() : SUBTYPE_VALUES;
  const bySubtype = Object.fromEntries(seriesNames.map((name) => [name, []]));
  for (const p of points || []) {
    if (!bySubtype[p.crop_subtype]) continue;
    const value = ecosystemMetricValue(p, metricKey);
    if (value == null) continue;
    bySubtype[p.crop_subtype].push({ year: p.year, value });
  }

  const series = Object.entries(bySubtype).filter(([, rows]) => rows.length);
  if (!series.length) {
    return `No ${meta.label.toLowerCase()} data by ${seriesDimNoun()} for the current filters.`;
  }

  const parts = [];
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const latestValues = {};
  for (const [name, rows] of series) {
    const last = rows[rows.length - 1];
    latestValues[name] = last?.value;
  }

  if (latestValues[SUBTYPE_A.value] != null && latestValues[SUBTYPE_B.value] != null) {
    const a = latestValues[SUBTYPE_A.value];
    const b = latestValues[SUBTYPE_B.value];
    const lead = a >= b ? SUBTYPE_A.value : SUBTYPE_B.value;
    const lag = lead === SUBTYPE_A.value ? SUBTYPE_B.value : SUBTYPE_A.value;
    const leadVal = latestValues[lead];
    const lagVal = latestValues[lag];
    const gapPct = pctChange(lagVal, leadVal);
    parts.push(
      `In ${lastYear}, ${lead.toLowerCase()} ${meta.label.toLowerCase()} led at ${fmt.score(leadVal, {
        compact: meta.compact,
      })} ${meta.unit}` +
        (gapPct == null
          ? `.`
          : `, about ${fmt.score(Math.abs(gapPct), { compact: false })}% above ${lag.toLowerCase()}.`)
    );
  } else {
    const [name, rows] = series[0];
    const last = rows[rows.length - 1];
    parts.push(
      `Showing ${name.toLowerCase()} ${meta.label.toLowerCase()} only: ${fmt.score(last.value, {
        compact: meta.compact,
      })} ${meta.unit} in ${last.year}.`
    );
  }

  for (const [name, rows] of series) {
    if (rows.length < 2) continue;
    const change = describeChange(pctChange(rows[0].value, rows[rows.length - 1].value));
    if (!change) continue;
    parts.push(
      `From ${rows[0].year} to ${rows[rows.length - 1].year}, ${name.toLowerCase()} ${meta.label.toLowerCase()} ${change}.`
    );
    break;
  }

  if (series.length === 2 && years.length >= 2) {
    const aFirst = bySubtype[SUBTYPE_A.value].find((r) => r.year === firstYear)?.value;
    const bFirst = bySubtype[SUBTYPE_B.value].find((r) => r.year === firstYear)?.value;
    const aLast = bySubtype[SUBTYPE_A.value].find((r) => r.year === lastYear)?.value;
    const bLast = bySubtype[SUBTYPE_B.value].find((r) => r.year === lastYear)?.value;
    if (aFirst != null && bFirst != null && aLast != null && bLast != null) {
      const gapFirst = aFirst - bFirst;
      const gapLast = aLast - bLast;
      if (Math.abs(gapLast) > Math.abs(gapFirst) * 1.15) {
        parts.push(
          `The ${SUBTYPE_A.label.toLowerCase()}–${SUBTYPE_B.label.toLowerCase()} gap widened over the selected period.`
        );
      } else if (Math.abs(gapLast) < Math.abs(gapFirst) * 0.85) {
        parts.push(
          `The ${SUBTYPE_A.label.toLowerCase()}–${SUBTYPE_B.label.toLowerCase()} gap narrowed over the selected period.`
        );
      }
    }
  }

  return parts.slice(0, 3).join(" ");
}

function renderEcosystemTrendChart() {
  if (!ecosystemTrendChart) return;
  const metricKey = getEcosystemMetric();
  const meta = ECOSYSTEM_METRICS[metricKey];
  if (els.ecosystemTrendTitle) els.ecosystemTrendTitle.textContent = meta.title;

  const years = [...new Set(ecosystemSeriesPoints.map((p) => p.year))].sort((a, b) => a - b);
  const seriesNames = chartSeriesValues().filter((name) =>
    ecosystemSeriesPoints.some((p) => p.crop_subtype === name)
  );

  const colors = ecosystemChartColors();

  ecosystemTrendChart.data.labels = years;
  ecosystemTrendChart.data.datasets = seriesNames.map((name) => {
    const byYear = new Map(
      ecosystemSeriesPoints
        .filter((p) => p.crop_subtype === name)
        .map((p) => [p.year, ecosystemMetricValue(p, metricKey)])
    );
    return {
      label: name,
      data: years.map((year) => byYear.get(year) ?? null),
      backgroundColor: (colors[name] || { bg: "#09663f" }).bg,
      hoverBackgroundColor: (colors[name] || { hover: "#09663f" }).hover,
      borderColor: (colors[name] || { border: "#09663f" }).border,
      borderWidth: 0,
      borderRadius: 3,
      maxBarThickness: 18,
      categoryPercentage: 0.7,
      barPercentage: 0.85,
    };
  });
  ecosystemTrendChart.options.plugins.tooltip.callbacks = {
    ...ecosystemTooltipCallbacks,
    label(ctx) {
      const v = ctx.parsed.y;
      if (v == null || Number.isNaN(v)) return `${ctx.dataset.label}: —`;
      return `${ctx.dataset.label}: ${fmt.score(v, { compact: meta.compact })} ${meta.unit}`;
    },
  };
  ecosystemTrendChart.options.scales.y.ticks.callback = (v) =>
    meta.compact ? fmt.compact(v) : fmt.score(v, { compact: false });
  updateChart(ecosystemTrendChart);

  if (els.ecosystemTrendChartSub) {
    els.ecosystemTrendChartSub.textContent = buildEcosystemTrendSummary(
      ecosystemSeriesPoints,
      metricKey
    );
  }
}

function growthPillHtml(growth) {
  if (growth == null || Number.isNaN(growth)) {
    return '<span class="growth-pill is-empty">—</span>';
  }
  const tone = growth > 0 ? "up" : growth < 0 ? "down" : "is-flat";
  const arrow = growth > 0 ? "▲" : growth < 0 ? "▼" : "•";
  const sign = growth > 0 ? "+" : "";
  return `<span class="growth-pill ${tone}"><span class="growth-arrow" aria-hidden="true">${arrow}</span>${sign}${fmt.score(growth, { compact: false })}<span class="value-unit">%</span></span>`;
}

function shareCellHtml(share) {
  if (share == null || Number.isNaN(share)) return "—";
  return `${fmt.score(share, { compact: false })}<span class="value-unit">%</span>`;
}


function setCompactScore(el, value, { compact = true, signed = false } = {}) {
  if (!el) return;
  if (value == null || Number.isNaN(Number(value))) {
    el.textContent = "—";
    setRawTip(el, null);
    return;
  }
  const num = Number(value);
  const sign = signed && num > 0 ? "+" : "";
  const detail = fmt.scoreDetail(num, { compact });
  el.textContent = `${sign}${detail.text}`;
  setRawTip(el, detail.compact ? `${sign}${detail.raw}` : null);
}

function valueWithUnit(value, unit, { compact = true, signed = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  const sign = signed && num > 0 ? "+" : "";
  const detail = fmt.scoreDetail(num, { compact });
  const display = `${sign}${detail.text}`;
  const unitHtml = unit ? `<span class="value-unit">${unit}</span>` : "";
  if (!detail.compact) return `${display}${unitHtml}`;
  const tip = `${sign}${detail.raw}${unit ? ` ${unit}` : ""}`;
  return `<span class="has-raw-tip" data-raw-tip="${escapeAttr(tip)}">${display}</span>${unitHtml}`;
}
function varianceMeta(variance) {
  const cls =
    variance == null ? "is-empty" : variance > 0 ? "up" : variance < 0 ? "down" : "is-flat";
  const text =
    variance == null ? "—" : `${variance > 0 ? "+" : ""}${fmt.score(variance)}`;
  return { cls, text };
}

function metricTriplet(latestNum, previousNum, share) {
  const variance =
    latestNum != null && previousNum != null ? latestNum - previousNum : null;
  let growth = null;
  if (latestNum != null && previousNum != null && previousNum !== 0) {
    growth = ((latestNum - previousNum) / previousNum) * 100;
  }
  const { cls } = varianceMeta(variance);
  return {
    varianceClass: cls,
    variance,
    growthHtml: growthPillHtml(growth),
    shareHtml: shareCellHtml(share),
  };
}

function renderVolumeCompareTable({
  latestYear,
  points,
  nameKey,
  preferredOrder = null,
  sortByLatest = false,
  sortTableKey = null,
  subtitleEl = null,
  tbodyEl = null,
  emptyMessage = "No data for the current filters.",
  rowClassFor = null,
  topN = null,
  topNLabel = null,
  onAfterRender = null,
}) {
  const previousYear = latestYear - 1;
  if (subtitleEl) {
    const displayLabel = topNLabel
      ? topNLabel.charAt(0).toUpperCase() + topNLabel.slice(1)
      : "";
    const limitNote =
      topN == null
        ? ""
        : topN > 0
          ? ` · Top ${topN}${displayLabel ? ` ${displayLabel}` : ""}`
          : displayLabel
            ? ` · All ${displayLabel}`
            : " · All";
    subtitleEl.textContent = `Volume (MT) · ${latestYear} vs ${previousYear}${limitNote}`;
  }
  if (!tbodyEl) return;

  const byName = new Map();
  for (const p of points || []) {
    const name = p[nameKey];
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, { latest: null, previous: null });
    const row = byName.get(name);
    if (Number(p.year) === latestYear) row.latest = p.volume_mt;
    if (Number(p.year) === previousYear) row.previous = p.volume_mt;
  }

  let names;
  if (preferredOrder && preferredOrder.length && topN == null) {
    names = [
      ...preferredOrder.filter((name) => byName.has(name)),
      ...[...byName.keys()].filter((name) => !preferredOrder.includes(name)).sort(),
    ];
  } else {
    names = [...byName.keys()];
  }

  if (!names.length) {
    tbodyEl.innerHTML = `<tr class="eco-empty-row"><td colspan="6">${emptyMessage}</td></tr>`;
    if (sortTableKey) syncTableSortHeaders(sortTableKey);
    onAfterRender?.(topN);
    return;
  }

  const sumKnown = (key) =>
    names.reduce((sum, name) => {
      const value = byName.get(name)?.[key];
      return sum + (value != null && !Number.isNaN(Number(value)) ? Number(value) : 0);
    }, 0);

  const hasAny = (key) =>
    names.some((name) => {
      const value = byName.get(name)?.[key];
      return value != null && !Number.isNaN(Number(value));
    });

  const latestTotal = hasAny("latest") ? sumKnown("latest") : null;
  const previousTotal = hasAny("previous") ? sumKnown("previous") : null;

  let entries = names.map((name) => {
    const { latest, previous } = byName.get(name);
    const latestNum =
      latest != null && !Number.isNaN(Number(latest)) ? Number(latest) : null;
    const previousNum =
      previous != null && !Number.isNaN(Number(previous)) ? Number(previous) : null;
    const variance =
      latestNum != null && previousNum != null ? latestNum - previousNum : null;
    let growth = null;
    if (latestNum != null && previousNum != null && previousNum !== 0) {
      growth = ((latestNum - previousNum) / previousNum) * 100;
    }
    const share =
      latestNum != null && latestTotal != null && latestTotal > 0
        ? (latestNum / latestTotal) * 100
        : null;
    return {
      name,
      latest: latestNum,
      previous: previousNum,
      variance,
      growth,
      share,
    };
  });

  if (topN != null) {
    entries = entries
      .filter((entry) => entry.latest != null && !Number.isNaN(entry.latest) && entry.latest !== 0)
      .sort(
        (a, b) =>
          (b.latest ?? -Infinity) - (a.latest ?? -Infinity) ||
          String(a.name).localeCompare(String(b.name))
      );
    if (topN > 0) entries = entries.slice(0, topN);
  }

  const sortState = sortTableKey
    ? tableSortState[sortTableKey]
    : sortByLatest
      ? { key: "latest", dir: "desc" }
      : preferredOrder?.length
        ? { key: "name", dir: "asc" }
        : { key: "name", dir: "asc" };

  entries = sortTableEntries(entries, sortState, {
    preferredOrder: topN != null ? null : preferredOrder,
    nameKey: "name",
  });

  if (sortTableKey) syncTableSortHeaders(sortTableKey);

  const rows = entries.map((entry) => {
    const { varianceClass, variance, growthHtml, shareHtml } = metricTriplet(
      entry.latest,
      entry.previous,
      entry.share
    );
    const rowClass =
      typeof rowClassFor === "function" ? rowClassFor(entry.name) : "eco-other";

    return `<tr class="${rowClass}">
        <td><span class="eco-name">${escapeHtml(entry.name)}</span></td>
        <td class="num">${valueWithUnit(entry.latest, "MT")}</td>
        <td class="num muted">${valueWithUnit(entry.previous, "MT")}</td>
        <td class="num ${varianceClass}">${valueWithUnit(variance, "MT", { signed: true })}</td>
        <td class="growth-col">${growthHtml}</td>
        <td class="share-col">${shareHtml}</td>
      </tr>`;
  });

  const totalShare = latestTotal != null && latestTotal > 0 ? 100 : null;
  const totalMetrics = metricTriplet(latestTotal, previousTotal, totalShare);
  rows.push(`<tr class="eco-total">
        <td><span class="eco-name">Total</span></td>
        <td class="num">${valueWithUnit(latestTotal, "MT")}</td>
        <td class="num muted">${valueWithUnit(previousTotal, "MT")}</td>
        <td class="num ${totalMetrics.varianceClass}">${valueWithUnit(totalMetrics.variance, "MT", { signed: true })}</td>
        <td class="growth-col">${totalMetrics.growthHtml}</td>
        <td class="share-col">${totalMetrics.shareHtml}</td>
      </tr>`);

  tbodyEl.innerHTML = rows.join("");
  onAfterRender?.(topN);
}

function compareSortText(a, b, dir) {
  const cmp = String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    sensitivity: "base",
  });
  return dir === "asc" ? cmp : -cmp;
}

function compareSortNumber(a, b, dir) {
  const aNull = a == null || Number.isNaN(Number(a));
  const bNull = b == null || Number.isNaN(Number(b));
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const diff = Number(a) - Number(b);
  return dir === "asc" ? diff : -diff;
}

function sortTableEntries(entries, sortState, { preferredOrder = null, nameKey = "name" } = {}) {
  const key = sortState?.key || nameKey;
  const dir = sortState?.dir === "asc" ? "asc" : "desc";
  return [...entries].sort((a, b) => {
    if (key === nameKey && preferredOrder?.length) {
      const rank = (name) => {
        const idx = preferredOrder.indexOf(name);
        return idx === -1 ? preferredOrder.length : idx;
      };
      const byPreferred = dir === "asc" ? rank(a[nameKey]) - rank(b[nameKey]) : rank(b[nameKey]) - rank(a[nameKey]);
      if (byPreferred) return byPreferred;
    }
    if (key === nameKey) {
      return compareSortText(a[nameKey], b[nameKey], dir);
    }
    const byValue = compareSortNumber(a[key], b[key], dir);
    if (byValue) return byValue;
    return compareSortText(a[nameKey], b[nameKey], "asc");
  });
}

function syncTableSortHeaders(tableKey) {
  const table = document.querySelector(`table[data-sort-table="${tableKey}"]`);
  const state = tableSortState[tableKey];
  if (!table || !state) return;
  table.querySelectorAll("th[data-sort-key]").forEach((th) => {
    const active = th.dataset.sortKey === state.key;
    th.classList.toggle("is-sorted", active);
    th.classList.toggle("is-asc", active && state.dir === "asc");
    th.classList.toggle("is-desc", active && state.dir === "desc");
    th.setAttribute(
      "aria-sort",
      active ? (state.dir === "asc" ? "ascending" : "descending") : "none"
    );
  });
}

function cycleTableSort(tableKey, columnKey) {
  const state = tableSortState[tableKey];
  if (!state) return;
  if (state.key === columnKey) {
    state.dir = state.dir === "asc" ? "desc" : "asc";
  } else {
    state.key = columnKey;
    state.dir = columnKey === "name" ? "asc" : "desc";
  }
}

function bindSortableTables() {
  document.querySelectorAll("table[data-sort-table]").forEach((table) => {
    const tableKey = table.dataset.sortTable;
    if (!tableKey || !tableSortState[tableKey]) return;
    table.querySelector("thead")?.addEventListener("click", (event) => {
      const th = event.target.closest("th[data-sort-key]");
      if (!th || !table.contains(th)) return;
      event.preventDefault();
      cycleTableSort(tableKey, th.dataset.sortKey);
      if (tableKey === "ecosystemVolume") {
        renderEcosystemVolumeTable(ecoVolumeLatestYear, ecoVolumePoints);
      } else if (tableKey === "regionVolume") {
        renderRegionVolumeTable(regionVolumeLatestYear, regionVolumePoints);
      } else if (tableKey === "regionEcosystem") {
        renderRegionEcosystemTable();
      } else if (tableKey === "provinceVolume") {
        renderProvinceVolumeTableFromCache();
      }
    });
  });
}

function ecosystemRowClass(name) {
  const ecoSlug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (ecoSlug === "irrigated" || ecoSlug === "rainfed" || ecoSlug === "yellow" || ecoSlug === "white") {
    return `eco-${ecoSlug}`;
  }
  return "eco-other";
}

function getEcosystemVolumeTopN() {
  if (!els.ecosystemVolumeTopN) return null;
  const raw = els.ecosystemVolumeTopN.value || String(ECOSYSTEM_VOLUME_TOP_N_DEFAULT);
  if (raw === "all") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : ECOSYSTEM_VOLUME_TOP_N_DEFAULT;
}

function syncEcosystemVolumeTableLayout(limit) {
  const wrap = els.ecosystemVolumeTableWrap;
  const table = document.getElementById("ecosystemVolumeTable");
  if (!wrap || !table) return;

  const tbody = table.tBodies[0];
  const dataRow = tbody?.querySelector("tr:not(.eco-empty-row):not(.eco-total)");
  if (!dataRow) {
    wrap.classList.remove("is-scrollable");
    return;
  }

  const headerH = table.tHead?.offsetHeight ?? 0;
  const rowH = dataRow.offsetHeight;
  const maxH = headerH + rowH * ECOSYSTEM_VOLUME_SCROLL_AT;
  wrap.style.setProperty("--ecosystem-table-max-height", `${maxH}px`);

  const needsScroll = limit == null ? false : limit === 0 || limit > ECOSYSTEM_VOLUME_SCROLL_AT;
  wrap.classList.toggle("is-scrollable", needsScroll);
}

function renderEcosystemVolumeTable(latestYear, points) {
  ecoVolumeLatestYear = latestYear;
  ecoVolumePoints = points || [];
  const narrowed = isCropFilterNarrowed();
  const scopedPoints = narrowed ? filterSeriesPointsByCrop(ecoVolumePoints) : ecoVolumePoints;
  const topN = narrowed ? null : IS_MULTI_CROP ? getEcosystemVolumeTopN() : null;
  renderVolumeCompareTable({
    latestYear,
    points: scopedPoints,
    nameKey: "crop_subtype",
    preferredOrder: narrowed || topN == null ? chartSeriesValues() : null,
    sortTableKey: "ecosystemVolume",
    subtitleEl: els.ecosystemVolumeTableSub,
    tbodyEl: els.ecosystemVolumeTableBody,
    emptyMessage: `No ${seriesDimNoun()} data for the current filters.`,
    rowClassFor: ecosystemRowClass,
    topN,
    topNLabel: IS_MULTI_CROP ? CONFIG.groupPlural || "crops" : null,
    onAfterRender: syncEcosystemVolumeTableLayout,
  });
}

function renderRegionVolumeTable(latestYear, points) {
  regionVolumeLatestYear = latestYear;
  regionVolumePoints = points || [];
  renderVolumeCompareTable({
    latestYear,
    points: regionVolumePoints,
    nameKey: "region",
    sortByLatest: true,
    sortTableKey: "regionVolume",
    subtitleEl: els.regionVolumeTableSub,
    tbodyEl: els.regionVolumeTableBody,
    emptyMessage: "No region data for the current filters.",
    rowClassFor: () => "eco-other",
  });
}

function getProvinceVolumeTopN() {
  const raw = els.provinceVolumeTopN?.value || String(PROVINCE_VOLUME_TOP_N_DEFAULT);
  if (raw === "all") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : PROVINCE_VOLUME_TOP_N_DEFAULT;
}

function hasVolumeValue(value) {
  if (value == null || value === "") return false;
  const n = Number(value);
  return !Number.isNaN(n) && n !== 0;
}

function syncProvinceVolumeTableLayout(limit) {
  const wrap = els.provinceVolumeTableWrap;
  const table = document.getElementById("provinceVolumeTable");
  if (!wrap || !table) return;

  const tbody = table.tBodies[0];
  const dataRow = tbody?.querySelector("tr:not(.eco-empty-row):not(.eco-total)");
  if (!dataRow) {
    wrap.classList.remove("is-scrollable");
    return;
  }

  const headerH = table.tHead?.offsetHeight ?? 0;
  const rowH = dataRow.offsetHeight;
  const maxH = headerH + rowH * PROVINCE_VOLUME_SCROLL_AT;
  wrap.style.setProperty("--province-table-max-height", `${maxH}px`);

  const needsScroll = limit === 0 || limit > PROVINCE_VOLUME_SCROLL_AT;
  wrap.classList.toggle("is-scrollable", needsScroll);
}

function renderProvinceVolumeTable(latestYear, points, { limit = getProvinceVolumeTopN() } = {}) {
  const previousYear = latestYear - 1;
  const limitLabel = limit > 0 ? `Top ${limit}` : "All";
  if (els.provinceVolumeTableSub) {
    els.provinceVolumeTableSub.textContent = `Volume (MT) · ${latestYear} vs ${previousYear} · ${limitLabel} Provinces`;
  }
  const tbody = els.provinceVolumeTableBody;
  if (!tbody) return;

  const byProvince = new Map();
  for (const p of points || []) {
    const province = p.province;
    if (!province) continue;
    const key = `${p.region || ""}\0${province}`;
    if (!byProvince.has(key)) {
      byProvince.set(key, {
        name: province,
        province,
        region: p.region || "—",
        latest: null,
        previous: null,
      });
    }
    const row = byProvince.get(key);
    if (Number(p.year) === latestYear) row.latest = p.volume_mt;
    if (Number(p.year) === previousYear) row.previous = p.volume_mt;
  }

  let entries = [...byProvince.values()]
    .filter((entry) => hasVolumeValue(entry.latest))
    .map((entry) => {
      const latestNum =
        entry.latest != null && !Number.isNaN(Number(entry.latest))
          ? Number(entry.latest)
          : null;
      const previousNum =
        entry.previous != null && !Number.isNaN(Number(entry.previous))
          ? Number(entry.previous)
          : null;
      const variance =
        latestNum != null && previousNum != null ? latestNum - previousNum : null;
      let growth = null;
      if (latestNum != null && previousNum != null && previousNum !== 0) {
        growth = ((latestNum - previousNum) / previousNum) * 100;
      }
      return {
        ...entry,
        latest: latestNum,
        previous: previousNum,
        variance,
        growth,
      };
    })
    .sort(
      (a, b) =>
        (b.latest ?? -Infinity) - (a.latest ?? -Infinity) ||
        String(a.name).localeCompare(String(b.name))
    );

  if (limit > 0) entries = entries.slice(0, limit);

  if (!entries.length) {
    tbody.innerHTML =
      '<tr class="eco-empty-row"><td colspan="6">No province data for the current filters.</td></tr>';
    syncTableSortHeaders("provinceVolume");
    syncProvinceVolumeTableLayout(limit);
    return;
  }

  const sumKnown = (key) =>
    entries.reduce((sum, row) => {
      const value = row[key];
      return sum + (value != null && !Number.isNaN(Number(value)) ? Number(value) : 0);
    }, 0);

  const hasAny = (key) =>
    entries.some((row) => row[key] != null && !Number.isNaN(Number(row[key])));

  const latestTotal = hasAny("latest") ? sumKnown("latest") : null;

  entries = entries.map((entry) => ({
    ...entry,
    share:
      entry.latest != null && latestTotal != null && latestTotal > 0
        ? (entry.latest / latestTotal) * 100
        : null,
  }));

  entries = sortTableEntries(entries, tableSortState.provinceVolume, {
    nameKey: "name",
  });
  syncTableSortHeaders("provinceVolume");

  const rows = entries.map((entry) => {
    const { varianceClass, variance, growthHtml, shareHtml } = metricTriplet(
      entry.latest,
      entry.previous,
      entry.share
    );

    return `<tr class="eco-other">
        <td><span class="eco-name">${entry.name}</span></td>
        <td class="num">${valueWithUnit(entry.latest, "MT")}</td>
        <td class="num muted">${valueWithUnit(entry.previous, "MT")}</td>
        <td class="num ${varianceClass}">${valueWithUnit(variance, "MT", { signed: true })}</td>
        <td class="growth-col">${growthHtml}</td>
        <td class="share-col">${shareHtml}</td>
      </tr>`;
  });

  tbody.innerHTML = rows.join("");
  syncProvinceVolumeTableLayout(limit);
}

function renderProvinceVolumeTableFromCache() {
  const { year_to } = getYearRange();
  renderProvinceVolumeTable(year_to, provinceComparePoints);
}

function getRegionEcosystemMetric() {
  const key = els.regionEcosystemMetric?.value || "volume_mt";
  return ECOSYSTEM_METRICS[key] ? key : "volume_mt";
}

function regionEcosystemMetricValue(cell, metricKey) {
  if (!cell) return null;
  if (metricKey === "yield_mt_ha") {
    if (cell.yield_mt_ha != null && !Number.isNaN(Number(cell.yield_mt_ha))) {
      return Number(cell.yield_mt_ha);
    }
    if (cell.area_ha && Number(cell.area_ha) > 0) {
      return Number(cell.volume_mt) / Number(cell.area_ha);
    }
    return null;
  }
  const value = cell[metricKey];
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

function combineRegionEcosystemCells(irrigated, rainfed) {
  const volume =
    (irrigated?.volume_mt != null ? Number(irrigated.volume_mt) : 0) +
    (rainfed?.volume_mt != null ? Number(rainfed.volume_mt) : 0);
  const area =
    (irrigated?.area_ha != null ? Number(irrigated.area_ha) : 0) +
    (rainfed?.area_ha != null ? Number(rainfed.area_ha) : 0);
  const hasVolume =
    (irrigated?.volume_mt != null && !Number.isNaN(Number(irrigated.volume_mt))) ||
    (rainfed?.volume_mt != null && !Number.isNaN(Number(rainfed.volume_mt)));
  const hasArea =
    (irrigated?.area_ha != null && !Number.isNaN(Number(irrigated.area_ha))) ||
    (rainfed?.area_ha != null && !Number.isNaN(Number(rainfed.area_ha)));
  return {
    volume_mt: hasVolume ? volume : null,
    area_ha: hasArea ? area : null,
    yield_mt_ha: hasArea && area > 0 ? volume / area : null,
  };
}

function formatRegionEcosystemMetric(value, metricKey) {
  if (value == null || Number.isNaN(value)) return "—";
  const meta = ECOSYSTEM_METRICS[metricKey] || ECOSYSTEM_METRICS.volume_mt;
  return valueWithUnit(value, meta.unit, { compact: false });
}

function renderRegionEcosystemTable() {
  const metricKey = getRegionEcosystemMetric();
  const meta = ECOSYSTEM_METRICS[metricKey] || ECOSYSTEM_METRICS.volume_mt;
  const { year_from, year_to } = getYearRange();
  if (els.regionEcosystemTableSub) {
    const years =
      year_from === year_to ? String(year_to) : `${year_from}–${year_to}`;
    els.regionEcosystemTableSub.textContent = `${meta.label} (${meta.unit}) · ${years}`;
  }

  const tbody = els.regionEcosystemTableBody;
  if (!tbody) return;

  const byRegion = new Map();
  for (const row of regionEcosystemRows || []) {
    const region = row.region;
    const subtype = row.crop_subtype;
    if (!region || !pairSubtypeValues().includes(subtype)) continue;
    if (!byRegion.has(region)) {
      byRegion.set(region, Object.fromEntries(pairSubtypeValues().map((name) => [name, null])));
    }
    byRegion.get(region)[subtype] = row;
  }

  let entries = [...byRegion.keys()].map((region) => {
    const cells = byRegion.get(region);
    const cellA = cells[SUBTYPE_A.value];
    const cellB = cells[SUBTYPE_B.value];
    const total = combineRegionEcosystemCells(cellA, cellB);
    return {
      name: region,
      irrigatedCell: cellA,
      rainfedCell: cellB,
      subtype_a: regionEcosystemMetricValue(cellA, metricKey),
      subtype_b: regionEcosystemMetricValue(cellB, metricKey),
      total: regionEcosystemMetricValue(total, metricKey),
    };
  });

  if (!entries.length) {
    tbody.innerHTML =
      `<tr class="eco-empty-row"><td colspan="4">No regional ${CONFIG.subtypeNoun} data for the current filters.</td></tr>`;
    syncTableSortHeaders("regionEcosystem");
    return;
  }

  const sortState = tableSortState.regionEcosystem;
  entries = sortTableEntries(entries, sortState, { nameKey: "name" });
  syncTableSortHeaders("regionEcosystem");

  let sumIrrVol = 0;
  let sumIrrArea = 0;
  let sumRainVol = 0;
  let sumRainArea = 0;
  let hasIrr = false;
  let hasRain = false;

  const rows = entries.map((entry) => {
    const irrigated = entry.irrigatedCell;
    const rainfed = entry.rainfedCell;

    if (irrigated?.volume_mt != null) {
      sumIrrVol += Number(irrigated.volume_mt);
      hasIrr = true;
    }
    if (irrigated?.area_ha != null) {
      sumIrrArea += Number(irrigated.area_ha);
      hasIrr = true;
    }
    if (rainfed?.volume_mt != null) {
      sumRainVol += Number(rainfed.volume_mt);
      hasRain = true;
    }
    if (rainfed?.area_ha != null) {
      sumRainArea += Number(rainfed.area_ha);
      hasRain = true;
    }

    return `<tr class="eco-other">
        <td><span class="eco-name">${escapeHtml(entry.name)}</span></td>
        <td class="num">${formatRegionEcosystemMetric(entry.subtype_a, metricKey)}</td>
        <td class="num">${formatRegionEcosystemMetric(entry.subtype_b, metricKey)}</td>
        <td class="num">${formatRegionEcosystemMetric(entry.total, metricKey)}</td>
      </tr>`;
  });

  const irrTotalCell = {
    volume_mt: hasIrr ? sumIrrVol : null,
    area_ha: hasIrr ? sumIrrArea : null,
    yield_mt_ha: hasIrr && sumIrrArea > 0 ? sumIrrVol / sumIrrArea : null,
  };
  const rainTotalCell = {
    volume_mt: hasRain ? sumRainVol : null,
    area_ha: hasRain ? sumRainArea : null,
    yield_mt_ha: hasRain && sumRainArea > 0 ? sumRainVol / sumRainArea : null,
  };
  const grandTotal = combineRegionEcosystemCells(irrTotalCell, rainTotalCell);

  rows.push(`<tr class="eco-total">
        <td><span class="eco-name">Total</span></td>
        <td class="num">${formatRegionEcosystemMetric(
          regionEcosystemMetricValue(irrTotalCell, metricKey),
          metricKey
        )}</td>
        <td class="num">${formatRegionEcosystemMetric(
          regionEcosystemMetricValue(rainTotalCell, metricKey),
          metricKey
        )}</td>
        <td class="num">${formatRegionEcosystemMetric(
          regionEcosystemMetricValue(grandTotal, metricKey),
          metricKey
        )}</td>
      </tr>`);

  tbody.innerHTML = rows.join("");
}

function setSigned(el, value, { asPercent = false, card = null } = {}) {
  if (card) card.classList.remove("up", "down");
  el.classList.remove("up", "down");
  if (value == null || Number.isNaN(value)) {
    el.textContent = "—";
    setRawTip(el, null);
    return;
  }
  const sign = value > 0 ? "+" : "";
  const detail = fmt.scoreDetail(value, { compact: !asPercent });
  el.textContent = `${sign}${detail.text}`;
  setRawTip(el, !asPercent && detail.compact ? `${sign}${detail.raw}` : null);
  const tone = value > 0 ? "up" : value < 0 ? "down" : null;
  if (tone) {
    el.classList.add(tone);
    if (card) card.classList.add(tone);
  }
}
function setDelta(el, value) {
  el.textContent = fmt.pct(value);
  el.classList.remove("up", "down");
  if (value > 0) el.classList.add("up");
  if (value < 0) el.classList.add("down");
}

function formatUpdatedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return { day, time, iso: date.toISOString() };
}

function renderStatus(state) {
  const status = state.status || "idle";
  const running = status === "running";
  if (els.refreshBtn) {
    els.refreshBtn.disabled = running;
    els.refreshBtn.classList.toggle("is-spinning", running);
  }

  if (!els.statusMeta) return;

  if (running) {
    els.statusMeta.className = "header-updated is-updating";
    els.statusMeta.innerHTML =
      '<span class="header-updated-label">Updating</span><span class="header-updated-value">Refreshing data…</span>';
  } else if (state.last_success) {
    const formatted = formatUpdatedAt(state.last_success);
    if (formatted) {
      els.statusMeta.className = "header-updated";
      els.statusMeta.innerHTML = `<span class="header-updated-label">Updated</span><time class="header-updated-value" datetime="${escapeAttr(
        formatted.iso
      )}">${escapeHtml(formatted.day)} · ${escapeHtml(formatted.time)}</time>`;
    } else {
      els.statusMeta.className = "header-updated";
      els.statusMeta.textContent = "";
    }
  } else if (status === "error" && state.last_error) {
    els.statusMeta.className = "header-updated is-error";
    els.statusMeta.innerHTML =
      '<span class="header-updated-label">Update failed</span><span class="header-updated-value">Could not refresh</span>';
  } else {
    els.statusMeta.className = "header-updated";
    els.statusMeta.textContent = "";
  }

  if (els.refreshBtn) {
    if (status === "error" && state.last_error) {
      els.refreshBtn.title = `Refresh failed: ${state.last_error}`;
    } else {
      els.refreshBtn.title = "Refresh data from PSA";
    }
  }
}

async function loadMeta() {
  const meta = await api(`/api/meta?${qs({ dataset: DATASET })}`);
  const years = meta.years || [];
  yearBounds = {
    min: years.length ? years[0] : 1990,
    max: years.length ? years[years.length - 1] : 2026,
  };
  buildYearScale();
  setYearRange(yearBounds.min, defaultYearTo(), { silent: true });

  populateRegions(meta.regions || []);
  provinceMeta = meta.provinces || [];
  populateProvinces(false);

  if (IS_MULTI_CROP) {
    const groups = meta.crop_groups || [];
    CONFIG.subtypes = groups.map((g, i) => ({
      value: g,
      label: g,
      color: CROP_PALETTE[i % CROP_PALETTE.length],
    }));
    const checked = defaultCropSelection(groups);
    fillMultiSelectOptions(els.crop, groups, { preserve: false, checkAll: false });
    setCheckedValues(els.crop, checked);
    SUBTYPE_VALUES = chartSeriesValues();
  }

  renderStatus(meta.refresh || {});
  markActiveFilterIcons();
  return meta;
}

function resetFilters() {
  setYearRange(yearBounds.min, defaultYearTo(), { silent: true });
  setCheckedValues(els.quarter, ["1", "2", "3", "4"]);
  setCheckedValues(els.semester, ["1", "2"]);
  if (IS_MULTI_CROP) {
    const groups = (CONFIG.subtypes || []).map((s) => s.value);
    setCheckedValues(els.crop, defaultCropSelection(groups));
  } else {
    setCheckedValues(els.crop, SUBTYPE_VALUES);
  }
  checkAllValues(els.region);
  populateProvinces(false);
  markActiveFilterIcons();
  refreshDashboard().catch((err) => console.error("Dashboard refresh failed:", err));
}

const CHART_EASE = "easeOutCubic";

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

function chartAnimOptions({ stagger = true } = {}) {
  const yFrom = (ctx) => {
    if (ctx.type !== "data") return undefined;
    const axisId = ctx.dataset?.yAxisID || "y";
    const scale = ctx.chart.scales[axisId];
    if (!scale) return undefined;
    const base = Math.min(0, scale.min);
    return scale.getPixelForValue(base);
  };

  const delay = (ctx) => {
    if (!stagger || ctx.type !== "data" || prefersReducedMotion()) return 0;
    const dsType =
      ctx.chart.data.datasets[ctx.datasetIndex]?.type || ctx.chart.config.type;
    const perPoint = dsType === "line" ? 28 : 38;
    const perSeries = dsType === "line" ? 0 : 55;
    return ctx.dataIndex * perPoint + ctx.datasetIndex * perSeries;
  };

  return {
    animation: {
      duration: 780,
      easing: CHART_EASE,
    },
    animations: {
      x: {
        type: "number",
        easing: CHART_EASE,
        duration: 680,
        from: NaN,
        delay,
      },
      y: {
        type: "number",
        easing: CHART_EASE,
        duration: 780,
        from: yFrom,
        delay,
      },
      colors: {
        type: "color",
        duration: 420,
        easing: "easeOutQuad",
      },
      numbers: {
        type: "number",
        duration: 420,
        easing: CHART_EASE,
      },
    },
    transitions: {
      active: {
        animation: {
          duration: 520,
          easing: CHART_EASE,
        },
      },
      resize: {
        animation: {
          duration: 0,
        },
      },
      show: {
        animations: {
          x: { from: 0 },
          y: { from: 0 },
        },
      },
      hide: {
        animations: {
          x: { to: 0 },
          y: { to: 0 },
        },
      },
    },
    elements: {
      bar: {
        borderRadius: 3,
        borderSkipped: false,
      },
      line: {
        borderJoinStyle: "round",
        borderCapStyle: "round",
        tension: 0.25,
      },
      point: {
        radius: 0,
        hoverRadius: 0,
        hitRadius: 12,
      },
    },
  };
}

/** Diverging bar entrance: grow from the zero baseline with staggered delay. */
function volumeGrowthAnimOptions() {
  const reduced = prefersReducedMotion();
  const zeroY = (ctx) => {
    if (ctx.type !== "data") return undefined;
    const scale = ctx.chart.scales.y;
    if (!scale) return undefined;
    return scale.getPixelForValue(0);
  };
  const delay = (ctx) => {
    if (reduced || ctx.type !== "data") return 0;
    return ctx.dataIndex * 34;
  };
  const duration = reduced ? 0 : 980;

  return {
    animation: {
      duration,
      easing: "easeOutQuart",
      onComplete(animation) {
        const chart = animation?.chart;
        if (!chart || chart.$growthExtrasReady) return;
        chart.$growthExtrasReady = true;
        chart.draw();
      },
    },
    animations: {
      y: {
        type: "number",
        easing: "easeOutQuart",
        duration,
        from: zeroY,
        delay,
      },
      base: {
        type: "number",
        easing: "easeOutQuart",
        duration,
        from: zeroY,
        delay,
      },
      colors: {
        type: "color",
        duration: reduced ? 0 : 560,
        easing: "easeOutQuad",
      },
    },
    transitions: {
      active: {
        animation: {
          duration: reduced ? 0 : 260,
          easing: "easeOutQuad",
        },
      },
      resize: {
        animation: {
          duration: 0,
        },
      },
    },
    elements: {
      bar: {
        borderRadius: 0,
        borderSkipped: false,
      },
    },
  };
}

function mixedTrendLegendLabels(chart) {
  return chart.data.datasets.map((ds, i) => {
    const hidden = chart.getDatasetMeta(i).hidden;
    const isLine = ds.type === "line";
    return {
      text: ds.label,
      datasetIndex: i,
      hidden: Boolean(hidden),
      pointStyle: isLine ? "line" : "rect",
      fillStyle: isLine ? "#09663f" : "#9ae856",
      strokeStyle: isLine ? "#09663f" : "#9ae856",
      lineWidth: isLine ? 2.5 : 0,
      fontColor: "#3f5340",
    };
  });
}

function lineLegendLabels(chart) {
  return chart.data.datasets.map((ds, i) => {
    const hidden = chart.getDatasetMeta(i).hidden;
    const color = ds.borderColor || "#06402b";
    return {
      text: ds.label,
      datasetIndex: i,
      hidden: Boolean(hidden),
      pointStyle: "line",
      fillStyle: color,
      strokeStyle: color,
      lineWidth: 2.5,
      fontColor: "#3f5340",
    };
  });
}

function mixedTrendMarkerStyle(ctx) {
  const isLine = ctx.dataset.type === "line";
  return {
    pointStyle: isLine ? "line" : "rect",
    borderColor: isLine ? "#09663f" : "#9ae856",
    backgroundColor: isLine ? "#09663f" : "#9ae856",
    borderWidth: isLine ? 2.5 : 0,
  };
}

const mixedTrendTooltipCallbacks = {
  title(items) {
    const item = items?.[0];
    if (!item) return "";
    const year = item.label;
    if (items.some((i) => i.dataset?.peakIndex === i.dataIndex)) return `Year ${year} · Peak`;
    if (items.some((i) => i.dataset?.lowIndex === i.dataIndex)) return `Year ${year} · Lowest`;
    return `Year ${year}`;
  },
  label(ctx) {
    const v = ctx.parsed.y;
    const label = ctx.dataset.label || "";
    if (v == null || Number.isNaN(v)) return `${label}: —`;
    const unit = label.toLowerCase().includes("area") ? "ha" : "MT";
    const base = `${label}: ${fmt.score(v, { compact: false })} ${unit}`;
    if (ctx.dataset?.peakIndex === ctx.dataIndex) return `${base} · highest in range`;
    if (ctx.dataset?.lowIndex === ctx.dataIndex) return `${base} · lowest in range`;
    return base;
  },
  labelPointStyle(ctx) {
    const style = mixedTrendMarkerStyle(ctx);
    return { pointStyle: style.pointStyle, rotation: 0 };
  },
  labelColor(ctx) {
    const style = mixedTrendMarkerStyle(ctx);
    return {
      borderColor: style.borderColor,
      backgroundColor: style.backgroundColor,
      borderWidth: style.borderWidth,
    };
  },
};

function lineMarkerStyle(ctx) {
  const color = ctx.dataset.borderColor || "#06402b";
  return {
    pointStyle: "line",
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2.5,
  };
}

const lineTooltipCallbacks = {
  labelPointStyle(ctx) {
    const style = lineMarkerStyle(ctx);
    return { pointStyle: style.pointStyle, rotation: 0 };
  },
  labelColor(ctx) {
    const style = lineMarkerStyle(ctx);
    return {
      borderColor: style.borderColor,
      backgroundColor: style.backgroundColor,
      borderWidth: style.borderWidth,
    };
  },
};

const ECOSYSTEM_CHART_COLORS = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return ecosystemChartColors()[prop];
    },
  }
);

function ecosystemMarkerStyle(ctx) {
  const label = ctx.dataset?.label || ctx;
  const colors = ECOSYSTEM_CHART_COLORS[label] || {
    bg: "rgba(90, 143, 106, 0.55)",
    border: "#5a8f6a",
  };
  return {
    pointStyle: "rect",
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderWidth: 0,
  };
}

function ecosystemLegendLabels(chart) {
  return chart.data.datasets.map((ds, i) => {
    const hidden = chart.getDatasetMeta(i).hidden;
    const style = ecosystemMarkerStyle({ dataset: ds });
    return {
      text: ds.label,
      datasetIndex: i,
      hidden: Boolean(hidden),
      pointStyle: style.pointStyle,
      fillStyle: style.backgroundColor,
      strokeStyle: style.borderColor,
      lineWidth: style.borderWidth,
      fontColor: "#3f5340",
    };
  });
}

const ecosystemTooltipCallbacks = {
  labelPointStyle(ctx) {
    const style = ecosystemMarkerStyle(ctx);
    return { pointStyle: style.pointStyle, rotation: 0 };
  },
  labelColor(ctx) {
    const style = ecosystemMarkerStyle(ctx);
    return {
      borderColor: style.borderColor,
      backgroundColor: style.backgroundColor,
      borderWidth: style.borderWidth,
    };
  },
};

function updateChart(chart, mode = "active") {
  if (!chart) return;
  chart.update(mode);
}

function yearMarkerStyle(borderColor, { pointCount = 0, peakIndex = -1 } = {}) {
  // Line-only charts: no visible markers (peak/low emphasis uses the glow plugin)
  void borderColor;
  void pointCount;
  void peakIndex;
  return {
    pointRadius: 0,
    pointHoverRadius: 0,
    pointHitRadius: 12,
    pointBackgroundColor: "transparent",
    pointBorderColor: "transparent",
    pointBorderWidth: 0,
    pointHoverBackgroundColor: "transparent",
    pointHoverBorderColor: "transparent",
    pointHoverBorderWidth: 0,
  };
}

function peakVolumeIndex(points) {
  return peakValueIndex((points || []).map((p) => p?.volume_mt));
}

function peakValueIndex(values) {
  let peakIdx = -1;
  let peakVal = -Infinity;
  (values || []).forEach((value, i) => {
    const v = Number(value);
    if (!Number.isNaN(v) && v > peakVal) {
      peakVal = v;
      peakIdx = i;
    }
  });
  return peakIdx;
}

function lowValueIndex(values) {
  let lowIdx = -1;
  let lowVal = Infinity;
  (values || []).forEach((value, i) => {
    const v = Number(value);
    if (!Number.isNaN(v) && v < lowVal) {
      lowVal = v;
      lowIdx = i;
    }
  });
  return lowIdx;
}

const volumeTimeSeriesTooltipCallbacks = {
  title(items) {
    const item = items?.[0];
    if (!item) return "";
    const year = item.label;
    if (item.dataset?.peakIndex === item.dataIndex) return `Year ${year} · Peak`;
    if (item.dataset?.lowIndex === item.dataIndex) return `Year ${year} · Lowest`;
    return `Year ${year}`;
  },
  label(ctx) {
    const v = ctx.parsed.y;
    if (v == null || Number.isNaN(v)) return "Production: —";
    const base = `Production: ${fmt.score(v, { compact: false })} MT`;
    if (ctx.dataset?.peakIndex === ctx.dataIndex) return `${base} · highest in range`;
    if (ctx.dataset?.lowIndex === ctx.dataIndex) return `${base} · lowest in range`;
    return base;
  },
  labelPointStyle() {
    return { pointStyle: "circle", rotation: 0 };
  },
  labelColor(ctx) {
    let color = "#09663f";
    if (ctx.dataset?.peakIndex === ctx.dataIndex) color = "#06402b";
    else if (ctx.dataset?.lowIndex === ctx.dataIndex) color = "#c62828";
    return {
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
    };
  },
};

function drawExtremumEffect(ctx, chartArea, point, { guide, glow }) {
  const { x, y } = point.getProps(["x", "y"], true);
  if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) return;

  const pulse =
    0.45 + 0.55 * (0.5 - 0.5 * Math.cos(((performance.now() % 1800) / 1800) * Math.PI * 2));

  ctx.save();

  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = `rgba(${guide.rgb}, ${guide.baseAlpha + pulse * guide.pulseAlpha})`;
  ctx.lineWidth = 1.5;
  ctx.moveTo(x, chartArea.top);
  ctx.lineTo(x, chartArea.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const ring of [
    { radius: 10 + pulse * 8, alpha: glow.outerBase + pulse * glow.outerPulse },
    { radius: 7 + pulse * 4, alpha: glow.innerBase + pulse * glow.innerPulse },
  ]) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(${glow.rgb}, ${ring.alpha})`;
    ctx.arc(x, y, ring.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBarExtremumEmphasis(ctx, chartArea, bar, { rgb, caption, valueIsPositive }) {
  const props = bar.getProps(["x", "y", "base", "width"], true);
  const { x, y, base, width } = props;
  if (
    x == null ||
    y == null ||
    base == null ||
    width == null ||
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    Number.isNaN(base) ||
    Number.isNaN(width)
  ) {
    return;
  }

  const half = Math.max(width / 2, 1);
  const bandPad = 5;
  const top = Math.min(y, base);
  const bottom = Math.max(y, base);
  const barHeight = Math.max(bottom - top, 1);

  ctx.save();

  // Soft column wash behind the bar for easy scan
  ctx.fillStyle = `rgba(${rgb}, 0.07)`;
  ctx.fillRect(
    x - half - bandPad,
    chartArea.top,
    width + bandPad * 2,
    chartArea.bottom - chartArea.top
  );

  // Crisp outline on the extremum bar
  ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - half, top, width, barHeight);

  // Marker pointing at the bar tip
  const marker = 5;
  ctx.beginPath();
  ctx.fillStyle = `rgb(${rgb})`;
  if (valueIsPositive) {
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x - marker, y - 4);
    ctx.lineTo(x + marker, y - 4);
  } else {
    ctx.moveTo(x, y + 11);
    ctx.lineTo(x - marker, y + 4);
    ctx.lineTo(x + marker, y + 4);
  }
  ctx.closePath();
  ctx.fill();

  if (caption) {
    ctx.font = "600 9px Roboto, system-ui, sans-serif";
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.textAlign = "center";
    if (valueIsPositive) {
      ctx.textBaseline = "bottom";
      ctx.fillText(caption, x, y - 14);
    } else {
      ctx.textBaseline = "top";
      ctx.fillText(caption, x, y + 14);
    }
  }

  ctx.restore();
}

const peakYearEffectPlugin = {
  id: "peakYearEffect",
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.enabled) return;

    let datasetIndex = options.datasetIndex;
    if (datasetIndex == null) {
      datasetIndex = chart.data.datasets.findIndex(
        (d) =>
          d &&
          ((d.peakIndex != null && d.peakIndex >= 0) ||
            (d.lowIndex != null && d.lowIndex >= 0))
      );
    }
    if (datasetIndex < 0) return;

    const dataset = chart.data.datasets[datasetIndex];
    const meta = chart.getDatasetMeta(datasetIndex);
    const area = chart.chartArea;
    const ctx = chart.ctx;
    const barMode =
      options.mode === "bar" ||
      chart.config.type === "bar" ||
      dataset?.type === "bar";

    if (barMode && options.waitForReady && !chart.$growthExtrasReady) return;

    const peakIndex = dataset?.peakIndex;
    if (peakIndex != null && peakIndex >= 0) {
      const peakPoint = meta?.data?.[peakIndex];
      if (peakPoint && !peakPoint.skip) {
        if (barMode) {
          const value = Number(dataset.data[peakIndex]);
          drawBarExtremumEmphasis(ctx, area, peakPoint, {
            rgb: "9, 102, 63",
            caption: "Highest",
            valueIsPositive: !(value < 0),
          });
        } else {
          drawExtremumEffect(ctx, area, peakPoint, {
            guide: { rgb: "6, 64, 43", baseAlpha: 0.18, pulseAlpha: 0.12 },
            glow: {
              rgb: "9, 102, 63",
              outerBase: 0.1,
              outerPulse: 0.08,
              innerBase: 0.16,
              innerPulse: 0.1,
            },
          });
        }
      }
    }

    const lowIndex = dataset?.lowIndex;
    if (lowIndex != null && lowIndex >= 0 && lowIndex !== peakIndex) {
      const lowPoint = meta?.data?.[lowIndex];
      if (lowPoint && !lowPoint.skip) {
        if (barMode) {
          const value = Number(dataset.data[lowIndex]);
          drawBarExtremumEmphasis(ctx, area, lowPoint, {
            rgb: "198, 40, 40",
            caption: "Lowest",
            valueIsPositive: !(value < 0),
          });
        } else {
          drawExtremumEffect(ctx, area, lowPoint, {
            guide: { rgb: "198, 40, 40", baseAlpha: 0.14, pulseAlpha: 0.1 },
            glow: {
              rgb: "198, 40, 40",
              outerBase: 0.09,
              outerPulse: 0.07,
              innerBase: 0.14,
              innerPulse: 0.09,
            },
          });
        }
      }
    }

    if (options.animate && !barMode && !chart.$peakPulseActive) {
      chart.$peakPulseActive = true;
      let last = 0;
      const tick = (now) => {
        if (!chart.canvas?.isConnected || !chart.options?.plugins?.peakYearEffect?.enabled) {
          chart.$peakPulseActive = false;
          return;
        }
        if (now - last > 40) {
          last = now;
          // Avoid redraw while hovering — continuous draw was clearing hover markers
          const hovering = (chart.getActiveElements?.() || []).length > 0;
          if (!hovering) chart.draw();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  },
};

const barValueLabelsPlugin = {
  id: "barValueLabels",
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.enabled) return;
    if (options.waitForReady && !chart.$growthExtrasReady) return;
    const { ctx } = chart;
    const dataset = chart.data.datasets?.[0];
    if (!dataset) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;

    const labelColor = options.color || "rgba(0, 0, 0, 0.78)";
    const peakIndex = dataset.peakIndex;
    const lowIndex = dataset.lowIndex;

    ctx.save();
    ctx.font = options.font || "600 10px Roboto, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = labelColor;

    meta.data.forEach((bar, index) => {
      if (!bar || bar.skip || !bar.getProps) return;
      const value = dataset.data[index];
      if (value == null || Number.isNaN(Number(value))) return;

      const num = Number(value);
      const props = bar.getProps(["x", "y", "base"], true);
      const label =
        typeof options.formatter === "function"
          ? options.formatter(num, index)
          : String(num);
      if (!label) return;

      // Leave room for Highest/Lowest captions drawn by the emphasis plugin
      const isExtremum = index === peakIndex || index === lowIndex;
      const offset = (options.offset ?? 4) + (isExtremum ? 16 : 0);
      if (num >= 0) {
        ctx.textBaseline = "bottom";
        ctx.fillText(label, props.x, props.y - offset);
      } else {
        ctx.textBaseline = "top";
        ctx.fillText(label, props.x, props.y + offset);
      }
    });
    ctx.restore();
  },
};

if (typeof Chart !== "undefined") {
  try {
    Chart.register(peakYearEffectPlugin);
  } catch (_err) {
    // already registered
  }
  try {
    Chart.register(barValueLabelsPlugin);
  } catch (_err) {
    // already registered
  }
}

function ensureCharts() {
  const grid = { color: "rgba(26, 46, 26, 0.08)", drawBorder: false };
  const tick = { color: "#3f5340", font: { size: 11, family: "Roboto" } };

  if (!trendChart) {
    const volumeOnly = CONFIG.showAreaYield === false;
    trendChart = new Chart(document.getElementById("trendChart"), {
      type: volumeOnly ? "line" : "bar",
      data: { labels: [], datasets: [] },
      options: {
        ...chartAnimOptions(),
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: volumeOnly
            ? { top: 10, right: 10, bottom: 2, left: 4 }
            : { top: 2, right: 2, bottom: 0, left: 2 },
        },
        interaction: { mode: "index", intersect: false },
        plugins: {
          peakYearEffect: {
            enabled: true,
            animate: true,
          },
          legend: {
            display: !volumeOnly,
            position: "bottom",
            align: "center",
            fullSize: false,
            labels: {
              padding: 8,
              font: { size: 11, family: "Roboto", weight: "500" },
              color: "#3f5340",
              usePointStyle: true,
              pointStyleWidth: 10,
              generateLabels: mixedTrendLegendLabels,
            },
          },
          tooltip: {
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            padding: 8,
            titleFont: { size: 12, family: "Roboto" },
            bodyFont: { size: 11, family: "Roboto" },
            callbacks: volumeOnly
              ? volumeTimeSeriesTooltipCallbacks
              : mixedTrendTooltipCallbacks,
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            grace: volumeOnly ? "8%" : 0,
            border: { display: false },
            grid,
            title: volumeOnly
              ? {
                  display: true,
                  text: "Production (MT)",
                  color: "#5f735f",
                  font: { size: 11, family: "Roboto", weight: "500" },
                  padding: { bottom: 4 },
                }
              : undefined,
            ticks: {
              ...tick,
              maxTicksLimit: volumeOnly ? 6 : 5,
              padding: 6,
              callback: (v) => fmt.compact(v),
            },
          },
          y1: {
            display: !volumeOnly,
            position: "right",
            beginAtZero: true,
            border: { display: false },
            grid: { drawOnChartArea: false },
            ticks: {
              ...tick,
              maxTicksLimit: 5,
              padding: 4,
              callback: (v) => fmt.compact(v),
            },
          },
          x: {
            border: { display: false },
            grid: volumeOnly
              ? { color: "rgba(26, 46, 26, 0.04)", drawBorder: false }
              : { display: false },
            title: volumeOnly
              ? {
                  display: true,
                  text: "Year",
                  color: "#5f735f",
                  font: { size: 11, family: "Roboto", weight: "500" },
                  padding: { top: 2 },
                }
              : undefined,
            ticks: {
              ...tick,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: volumeOnly ? 12 : 10,
              padding: volumeOnly ? 4 : 0,
            },
          },
        },
      },
    });
  }

  if (!volumeGrowthChart) {
    const growthCanvas = document.getElementById("volumeGrowthChart");
    if (growthCanvas) {
      volumeGrowthChart = new Chart(growthCanvas, {
        type: "bar",
        data: { labels: [], datasets: [] },
        options: {
          ...volumeGrowthAnimOptions(),
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { top: 30, right: 14, bottom: 22, left: 8 },
          },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            peakYearEffect: {
              enabled: true,
              mode: "bar",
              animate: false,
              waitForReady: true,
            },
            barValueLabels: {
              enabled: true,
              waitForReady: true,
              offset: 6,
              font: "600 11px Roboto, system-ui, sans-serif",
              color: "rgba(0, 0, 0, 0.78)",
              formatter(value) {
                const sign = value > 0 ? "+" : "";
                return `${sign}${fmt.score(value, { compact: false })}%`;
              },
            },
            tooltip: {
              usePointStyle: false,
              displayColors: false,
              padding: 10,
              backgroundColor: "rgba(26, 46, 26, 0.92)",
              titleColor: "#ffffff",
              bodyColor: "rgba(255, 255, 255, 0.92)",
              titleFont: { size: 12, family: "Roboto", weight: "600" },
              bodyFont: { size: 12, family: "Roboto" },
              cornerRadius: 4,
              caretPadding: 8,
              callbacks: {
                title(items) {
                  const item = items?.[0];
                  if (!item) return "";
                  const year = item.label;
                  const peakIndex = item.dataset?.peakIndex;
                  const lowIndex = item.dataset?.lowIndex;
                  if (peakIndex === item.dataIndex) return `Year ${year} · Peak`;
                  if (lowIndex === item.dataIndex) return `Year ${year} · Lowest`;
                  return `Year ${year}`;
                },
                label(ctx) {
                  const i = ctx.dataIndex;
                  const year = Number(ctx.label);
                  const prevYear = Number.isFinite(year) ? year - 1 : null;
                  const v = ctx.parsed.y;
                  const current = ctx.dataset?.currentVolumes?.[i];
                  const previous = ctx.dataset?.previousVolumes?.[i];
                  const variance = ctx.dataset?.variances?.[i];

                  const formatMt = (value, { signed = false } = {}) => {
                    if (value == null || Number.isNaN(Number(value))) return "—";
                    const num = Number(value);
                    const sign = signed && num > 0 ? "+" : "";
                    return `${sign}${fmt.score(num, { compact: false })} MT`;
                  };

                  const lines = [];
                  if (v == null || Number.isNaN(v)) {
                    lines.push("YoY growth: —");
                  } else {
                    const sign = v > 0 ? "+" : "";
                    let growth = `YoY growth: ${sign}${fmt.score(v, { compact: false })}%`;
                    if (ctx.dataset?.peakIndex === i) growth += " · highest in range";
                    else if (ctx.dataset?.lowIndex === i) growth += " · lowest in range";
                    lines.push(growth);
                  }

                  lines.push(
                    `Production (${Number.isFinite(year) ? year : "year"}): ${formatMt(current)}`
                  );
                  lines.push(
                    `Production (${prevYear != null ? prevYear : "prior"}): ${formatMt(previous)}`
                  );
                  lines.push(`Variance: ${formatMt(variance, { signed: true })}`);
                  return lines;
                },
              },
            },
          },
          scales: {
            y: {
              grace: "18%",
              border: { display: false },
              grid: {
                color: (ctx) =>
                  ctx.tick.value === 0
                    ? "rgba(26, 46, 26, 0.36)"
                    : "rgba(26, 46, 26, 0.06)",
                lineWidth: (ctx) => (ctx.tick.value === 0 ? 1.75 : 1),
                drawBorder: false,
              },
              title: {
                display: true,
                text: "Growth rate (%)",
                color: "#5f735f",
                font: { size: 11, family: "Roboto", weight: "500" },
                padding: { bottom: 8 },
              },
              ticks: {
                ...tick,
                maxTicksLimit: 8,
                padding: 8,
                callback: (v) => `${fmt.score(v, { compact: false })}%`,
              },
            },
            x: {
              border: { display: false },
              grid: { display: false },
              title: {
                display: true,
                text: "Year",
                color: "#5f735f",
                font: { size: 11, family: "Roboto", weight: "500" },
                padding: { top: 6 },
              },
              ticks: {
                ...tick,
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 16,
                padding: 6,
              },
            },
          },
        },
      });
      volumeGrowthChart.$growthExtrasReady = true;
    }
  }

  if (!yieldTrendChart) {
    const yieldCanvas = document.getElementById("yieldTrendChart");
    if (yieldCanvas) {
    yieldTrendChart = new Chart(yieldCanvas, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        ...chartAnimOptions(),
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 2, right: 2, bottom: 0, left: 2 },
        },
        interaction: { mode: "index", intersect: false },
        plugins: {
          peakYearEffect: {
            enabled: true,
            animate: true,
          },
          legend: {
            position: "bottom",
            align: "center",
            fullSize: false,
            labels: {
              padding: 8,
              font: { size: 11, family: "Roboto", weight: "500" },
              color: "#3f5340",
              usePointStyle: true,
              pointStyleWidth: 10,
              generateLabels: lineLegendLabels,
            },
          },
          tooltip: {
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            padding: 8,
            titleFont: { size: 12, family: "Roboto" },
            bodyFont: { size: 11, family: "Roboto" },
            callbacks: {
              ...lineTooltipCallbacks,
              title(items) {
                const item = items?.[0];
                if (!item) return "";
                const year = item.label;
                if (item.dataset?.peakIndex === item.dataIndex) return `Year ${year} · Peak`;
                if (item.dataset?.lowIndex === item.dataIndex) return `Year ${year} · Lowest`;
                return `Year ${year}`;
              },
              label(ctx) {
                const v = ctx.parsed.y;
                if (v == null || Number.isNaN(v)) return `${ctx.dataset.label}: —`;
                const base = `${ctx.dataset.label}: ${fmt.score(v, { compact: false })} MT/ha`;
                if (ctx.dataset?.peakIndex === ctx.dataIndex) return `${base} · highest in range`;
                if (ctx.dataset?.lowIndex === ctx.dataIndex) return `${base} · lowest in range`;
                return base;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            border: { display: false },
            grid,
            ticks: {
              ...tick,
              maxTicksLimit: 5,
              padding: 4,
              callback: (v) => fmt.score(v, { compact: false }),
            },
          },
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: {
              ...tick,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10,
              padding: 0,
            },
          },
        },
      },
    });
    }
  }

  if (!ecosystemTrendChart) {
    const ecosystemCanvas = document.getElementById("ecosystemTrendChart");
    if (ecosystemCanvas) {
    ecosystemTrendChart = new Chart(ecosystemCanvas, {
      type: "bar",
      data: { labels: [], datasets: [] },
      options: {
        ...chartAnimOptions(),
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 2, right: 2, bottom: 0, left: 2 },
        },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            align: "center",
            fullSize: false,
            labels: {
              padding: 8,
              font: { size: 11, family: "Roboto", weight: "500" },
              color: "#3f5340",
              usePointStyle: true,
              pointStyleWidth: 10,
              generateLabels: ecosystemLegendLabels,
            },
          },
          tooltip: {
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            padding: 8,
            titleFont: { size: 12, family: "Roboto" },
            bodyFont: { size: 11, family: "Roboto" },
            callbacks: ecosystemTooltipCallbacks,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            border: { display: false },
            grid,
            ticks: {
              ...tick,
              maxTicksLimit: 5,
              padding: 4,
              callback: (v) => fmt.score(v, { compact: false }),
            },
          },
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: {
              ...tick,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10,
              padding: 0,
            },
          },
        },
      },
    });
    }
  }
}

function updateComparisonLabels(cmp) {
  const root = document.getElementById("productionComparison");
  if (!root || !cmp) return;
  const yTo = cmp.year_to;
  const yFrom = cmp.year_from;
  const title = document.getElementById("productionComparisonLabel");
  if (title && yTo != null && yFrom != null) {
    title.textContent = `Production · ${yTo} vs ${yFrom}`;
  }
  const toLabel = root.querySelector('[data-cmp-year="to"]');
  const fromLabel = root.querySelector('[data-cmp-year="from"]');
  const varianceMeta = root.querySelector("[data-cmp-variance-meta]");
  if (toLabel && yTo != null) toLabel.textContent = String(yTo);
  if (fromLabel && yFrom != null) fromLabel.textContent = String(yFrom);
  if (varianceMeta && yTo != null && yFrom != null) {
    varianceMeta.textContent = `${yTo} − ${yFrom}`;
  }
}

function renderPriorityCropCards(rows) {
  const priorityRows = rows || [];
  latestPriorityCropGroups = priorityRows.map((r) => r.crop_group);
  const track = document.getElementById("priorityCropsTrack");
  if (track) {
    const topN = CONFIG.priorityCropTopN || 3;
    const items = priorityRows.slice(0, topN);
    if (!items.length) {
      track.innerHTML =
        '<article class="score-card"><span class="score-meta">No commodity data for the current filters.</span></article>';
      return;
    }
    track.innerHTML = items
      .map((row, i) => {
        const shareHtml =
          row.share_pct == null
            ? "No share of total"
            : `<span class="score-meta-emphasis">${escapeHtml(
                fmt.score(row.share_pct, { compact: false })
              )}%</span> of total production`;
        return `<article class="score-card" data-priority-crop="${escapeAttr(row.crop_group)}">
      <span class="score-label"><span class="score-label-rank" aria-hidden="true">#${i + 1}</span> ${escapeHtml(
          row.crop_group
        )}</span>
      <div class="score-body">
        <div class="score-metric">
          <strong class="score-value">${escapeHtml(fmt.score(row.volume_mt_avg))}</strong>
          <span class="score-unit">MT</span>
        </div>
        <span class="score-meta" data-priority-hint>${shareHtml}</span>
      </div>
    </article>`;
      })
      .join("");
    return;
  }

  for (const row of priorityRows) {
    const card = document.querySelector(
      `[data-priority-crop="${CSS.escape(row.crop_group)}"]`
    );
    const el =
      card?.querySelector(".score-value") ||
      document.getElementById(
        `kpiPriority${String(row.crop_group).replace(/[^A-Za-z0-9]+/g, "")}`
      );
    if (el) setCompactScore(el, row.volume_mt_avg);
    const hintEl = card?.querySelector("[data-priority-hint]");
    if (hintEl) {
      if (row.share_pct == null) {
        hintEl.textContent = "No share of total";
      } else {
        const pct = fmt.score(row.share_pct, { compact: false });
        hintEl.innerHTML = `<span class="score-meta-emphasis">${escapeHtml(
          pct
        )}%</span> of total production`;
      }
    }
  }
}

async function refreshDashboard() {
  const refreshSeq = ++dashboardRefreshSeq;
  ensureCharts();
  const base = commonParams();
  const { year_from, year_to } = getYearRange();
  const wantsVolumeGrowth = Boolean(document.getElementById("volumeGrowthChart"));
  const wantsRegionEcosystem = Boolean(els.regionEcosystemTableBody);
  const seriesParams = wantsVolumeGrowth
    ? { ...base, year_from: Math.max(yearBounds.min, year_from - 1) }
    : base;

  const compareParams = {
    ...base,
    year_from: Math.max(yearBounds.min, year_to - 1),
    year_to,
  };
  const [kpi, series, ecosystemSeries, ecoCompare, regionCompare, regionEcosystem, provinceCompare] =
    await Promise.all([
      api(`/api/kpis?${qs(base)}`),
      api(`/api/series?${qs(seriesParams)}`),
      api(`/api/series-by-ecosystem?${qs(base)}`),
      api(`/api/series-by-ecosystem?${qs(compareParams)}`),
      api(`/api/series-by-region?${qs(compareParams)}`),
      wantsRegionEcosystem
        ? api(`/api/by-region-ecosystem?${qs(base)}`)
        : Promise.resolve({ rows: [] }),
      api(`/api/series-by-province?${qs(compareParams)}`),
    ]);

  if (refreshSeq !== dashboardRefreshSeq) return;

  setCompactScore(els.kpiVolume, kpi.volume_mt_avg);
  if (CONFIG.showAreaYield !== false) {
    setCompactScore(els.kpiArea, kpi.area_ha_avg);
    setCompactScore(els.kpiYield, kpi.yield_mt_ha, { compact: false });
  }
  const nYears = kpi.year_count || year_to - year_from + 1;
  const hint =
    nYears === 1
      ? `${year_from} · 1 year`
      : `${year_from}–${year_to} · Average of ${fmt.number(nYears)} years`;
  if (els.kpiVolumeHint) els.kpiVolumeHint.textContent = hint;
  if (CONFIG.showAreaYield !== false && els.kpiAreaHint) els.kpiAreaHint.textContent = hint;

  renderPriorityCropCards(kpi.by_priority_crop || []);

  const bySubtype = kpi.by_subtype || [];
  if (IS_MULTI_CROP) {
    setSubtypePairFromKpi(bySubtype);
    SUBTYPE_VALUES = chartSeriesValues();
  }
  if (CONFIG.showSubtypeAverages !== false) {
    const subtypeA = bySubtype.find((r) => r.crop_subtype === SUBTYPE_A.value) || bySubtype[0] || {};
    const subtypeB = bySubtype.find((r) => r.crop_subtype === SUBTYPE_B.value) || bySubtype[1] || {};
    if (els.kpiIrrigated) setCompactScore(els.kpiIrrigated, subtypeA.volume_mt_avg);
    if (els.kpiRainfed) setCompactScore(els.kpiRainfed, subtypeB.volume_mt_avg);
    if (els.kpiIrrigatedShare) {
      els.kpiIrrigatedShare.textContent =
        subtypeA.share_pct == null
          ? "No share"
          : `${fmt.score(subtypeA.share_pct, { compact: false })}% of total production`;
    }
    if (els.kpiRainfedShare) {
      els.kpiRainfedShare.textContent =
        subtypeB.share_pct == null
          ? "No share"
          : `${fmt.score(subtypeB.share_pct, { compact: false })}% of total production`;
    }
    const shareA = subtypeA.share_pct ?? 0;
    const shareB = subtypeB.share_pct ?? 0;
    if (els.subtypeBarIrrigated) {
      els.subtypeBarIrrigated.style.width = `${shareA}%`;
      els.subtypeBarIrrigated.style.background = SUBTYPE_A.color;
    }
    if (els.subtypeBarRainfed) {
      els.subtypeBarRainfed.style.width = `${shareB}%`;
      els.subtypeBarRainfed.style.background = SUBTYPE_B.color;
    }
    if (els.subtypeBarHint) {
      els.subtypeBarHint.textContent =
        subtypeA.share_pct == null && subtypeB.share_pct == null
          ? `No ${CONFIG.subtypeNoun} split`
          : `${SUBTYPE_A.label} ${fmt.score(shareA, { compact: false })}% · ${SUBTYPE_B.label} ${fmt.score(shareB, { compact: false })}%`;
    }
  }

  const cmp = kpi.comparison || {};
  updateComparisonLabels(cmp);
  setCompactScore(els.cmpVolume2025, cmp.volume_mt_to);
  setCompactScore(els.cmpVolume2024, cmp.volume_mt_from);
  setSigned(els.cmpVariance, cmp.variance_mt, { card: els.cmpVarianceCard });
  setSigned(els.cmpGrowth, cmp.growth_rate_pct, {
    asPercent: true,
    card: els.cmpGrowthCard,
  });

  const seriesPoints = series.points || [];
  const points = wantsVolumeGrowth
    ? seriesPoints.filter((p) => {
        const year = Number(p.year);
        return year >= year_from && year <= year_to;
      })
    : seriesPoints;
  trendChart.data.labels = points.map((p) => p.year);
  if (CONFIG.showAreaYield === false) {
    const pointCount = points.length;
    const volumes = points.map((p) => p.volume_mt);
    const peakIndex = peakValueIndex(volumes);
    const lowIndex = lowValueIndex(volumes);
    trendChart.data.datasets = [
      {
        type: "line",
        label: "Production volume",
        data: volumes,
        borderColor: "#09663f",
        backgroundColor: "rgba(9, 102, 63, 0.14)",
        tension: 0.3,
        fill: true,
        spanGaps: true,
        peakIndex,
        lowIndex,
        ...yearMarkerStyle("#09663f", { pointCount, peakIndex }),
        borderWidth: 2.5,
        yAxisID: "y",
      },
    ];
  } else {
    const pointCount = points.length;
    const volumes = points.map((p) => p.volume_mt);
    const peakIndex = peakValueIndex(volumes);
    const lowIndex = lowValueIndex(volumes);
    trendChart.data.datasets = [
      {
        type: "bar",
        label: "Area harvested (ha)",
        data: points.map((p) => p.area_ha),
        backgroundColor: "#9ae856",
        hoverBackgroundColor: "#9ae856",
        borderColor: "#9ae856",
        borderWidth: 0,
        borderRadius: 3,
        maxBarThickness: 22,
        categoryPercentage: 0.7,
        barPercentage: 0.85,
        yAxisID: "y1",
        order: 1,
      },
      {
        type: "line",
        label: "Volume (MT)",
        data: volumes,
        borderColor: "#09663f",
        backgroundColor: "rgba(9, 102, 63, 0.12)",
        tension: 0.25,
        fill: false,
        peakIndex,
        lowIndex,
        ...yearMarkerStyle("#09663f", { pointCount, peakIndex }),
        borderWidth: 2,
        yAxisID: "y",
        order: 0,
      },
    ];
  }
  updateChart(trendChart);
  if (els.trendChartSub) {
    els.trendChartSub.textContent = buildTrendSummary(points);
  }
  renderVolumeGrowthChart(seriesPoints);

  if (yieldTrendChart) {
    const yields = points.map((p) => yieldForPoint(p));
    const pointCount = points.length;
    const peakIndex = peakValueIndex(yields);
    const lowIndex = lowValueIndex(yields);
    yieldTrendChart.data.labels = points.map((p) => p.year);
    yieldTrendChart.data.datasets = [
      {
        type: "line",
        label: "Yield (MT/ha)",
        data: yields,
        borderColor: "#06402b",
        backgroundColor: "rgba(6, 64, 43, 0.12)",
        tension: 0.25,
        fill: true,
        peakIndex,
        lowIndex,
        ...yearMarkerStyle("#06402b", { pointCount, peakIndex }),
        borderWidth: 2,
      },
    ];
    updateChart(yieldTrendChart);
  }
  if (els.yieldTrendChartSub) {
    els.yieldTrendChartSub.textContent = buildYieldTrendSummary(points);
  }

  ecosystemSeriesPoints = isCropFilterNarrowed()
    ? filterSeriesPointsByCrop(ecosystemSeries.points || [])
    : ecosystemSeries.points || [];
  renderEcosystemTrendChart();

  const ecoComparePoints = isCropFilterNarrowed()
    ? filterSeriesPointsByCrop(ecoCompare.points || [])
    : ecoCompare.points || [];
  renderEcosystemVolumeTable(year_to, ecoComparePoints);
  renderRegionVolumeTable(year_to, regionCompare.points || []);
  provinceComparePoints = provinceCompare.points || [];
  renderProvinceVolumeTableFromCache();
  regionEcosystemRows = regionEcosystem.rows || [];
  renderRegionEcosystemTable();

  dashboardSnapshot = {
    generatedAt: Date.now(),
    year_from,
    year_to,
    kpi,
    seriesPoints: points,
    seriesPointsForGrowth: seriesPoints,
    ecoComparePoints,
    regionComparePoints: regionCompare.points || [],
    provinceComparePoints: provinceCompare.points || [],
    regionEcosystemRows: regionEcosystem.rows || [],
  };
}

async function pollRefreshStatus() {
  try {
    const state = await api("/api/refresh/status");
    renderStatus(state);
    if (state.status === "ok") {
      const health = await api("/api/health");
      const datasetHealth = health.datasets?.[DATASET];
      const dbReady = datasetHealth?.ready ?? health.db_exists;
      if (!dbReady) return;
      clearInterval(pollTimer);
      pollTimer = null;
      await loadMeta();
      await refreshDashboard();
    }
    if (state.status === "error") {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } catch (err) {
    renderStatus({ status: "error", message: err.message });
  }
}

async function triggerRefresh() {
  renderStatus({ status: "running", message: "Refreshing…" });
  await api("/api/refresh", { method: "POST" });
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollRefreshStatus, 2500);
}

function markActiveFilterIcons() {
  document.querySelectorAll(".filter-field").forEach((field) => {
    const key = field.dataset.filter;
    if (key === "year") {
      const { year_from, year_to } = getYearRange();
      const narrowed = year_from !== yearBounds.min || year_to !== defaultYearTo();
      field.classList.toggle("is-active", narrowed);
      return;
    }
    const multi = field.querySelector(".multi-select");
    if (multi) {
      field.classList.toggle("is-active", isPartialMultiSelect(multi));
      return;
    }
    const select = field.querySelector("select");
    if (!select) return;
    field.classList.toggle("is-active", Boolean(select.value));
  });
  renderFilterSummary();
}

function multiSelectDisplay(groupEl, { formatLabel = (v) => v, maxNames = 2 } = {}) {
  if (!groupEl) return { text: "All", narrowed: false };
  const boxes = [...groupEl.querySelectorAll('input[type="checkbox"]')];
  if (!boxes.length) return { text: "All", narrowed: false };
  const selected = boxes.filter((b) => b.checked);
  if (!selected.length || selected.length === boxes.length) {
    return { text: "All", narrowed: false };
  }
  const labels = selected.map((b) => formatLabel(b.value));
  if (labels.length <= maxNames) {
    return { text: labels.join(", "), narrowed: true };
  }
  return { text: `${labels.length} selected`, narrowed: true };
}

function renderFilterSummary() {
  const host = els.filterSummaryChips;
  if (!host) return;

  const { year_from, year_to } = getYearRange();
  const yearNarrowed = year_from !== yearBounds.min || year_to !== defaultYearTo();
  const yearText =
    year_from === year_to ? String(year_from) : `${year_from} – ${year_to}`;

  const quarter = multiSelectDisplay(els.quarter, {
    formatLabel: (v) => `Q${v}`,
    maxNames: 4,
  });
  const semester = multiSelectDisplay(els.semester, {
    formatLabel: (v) => `S${v}`,
    maxNames: 2,
  });
  const ecosystem = multiSelectDisplay(els.crop, { maxNames: 2 });
  const region = multiSelectDisplay(els.region, { maxNames: 2 });
  const province = multiSelectDisplay(els.province, { maxNames: 2 });

  const chips = [
    { label: "Year", text: yearText, narrowed: yearNarrowed },
    { label: "Quarter", ...quarter },
    { label: "Semester", ...semester },
    { label: filterDimLabel(), ...ecosystem },
    { label: "Region", ...region },
    { label: "Province", ...province },
  ];

  host.innerHTML = chips
    .map(
      (chip) =>
        `<span class="filter-summary-chip${chip.narrowed ? " is-narrowed" : ""}"><span class="filter-summary-chip-label">${escapeHtml(
          chip.label
        )}</span><span class="filter-summary-chip-value">${escapeHtml(chip.text)}</span></span>`
    )
    .join("");
}

function scheduleYearRefresh() {
  syncYearRangeUI();
  markActiveFilterIcons();
  if (yearRefreshTimer) clearTimeout(yearRefreshTimer);
  yearRefreshTimer = setTimeout(() => {
    yearRefreshTimer = null;
    refreshDashboard().catch((err) => console.error("Dashboard refresh failed:", err));
  }, 180);
}

function applyDashboardConfig() {
  document.title = CONFIG.title;
  const titleEl = document.getElementById("dashboardTitle");
  if (titleEl) titleEl.textContent = CONFIG.title;
  const footerProduct = document.getElementById("footerProductName");
  if (footerProduct) footerProduct.textContent = CONFIG.title;

  if (CONFIG.showSubtypeAverages === false) {
    document.getElementById("subtypeAverages")?.setAttribute("hidden", "");
  }

  const filterLabel = filterDimLabel();
  const allLabel = filterAllLabel();
  const subtypeLabel = document.getElementById("subtypeFilterLabel");
  if (subtypeLabel) subtypeLabel.textContent = filterLabel;
  const subtypeField = document.getElementById("subtypeFilterField");
  if (subtypeField) subtypeField.title = filterLabel;
  if (els.crop) {
    els.crop.dataset.allLabel = allLabel;
    const panel = document.getElementById("subtypeFilterPanel");
    if (panel && !IS_MULTI_CROP && CONFIG.subtypes?.length) {
      panel.setAttribute("aria-label", filterLabel);
      const optionsHtml = CONFIG.subtypes
        .map(
          (s) =>
            `<label class="multi-select-option"><input type="checkbox" value="${escapeHtml(
              s.value
            )}" checked /><span>${escapeHtml(s.label)}</span></label>`
        )
        .join("");
      panel.innerHTML = `${multiSelectActionsHtml({
        searchable: isMultiSelectSearchable(els.crop),
        searchPlaceholder: multiSelectSearchPlaceholder(els.crop),
      })}${optionsHtml}`;
    } else if (panel) {
      panel.setAttribute("aria-label", filterLabel);
    }
    syncMultiSelectSummary(els.crop);
  }

  const subtypeGroupLabel = document.getElementById("subtypeGroupLabel");
  if (subtypeGroupLabel) {
    subtypeGroupLabel.textContent = `Avg production by ${CONFIG.subtypeNoun}`;
  }
  const labelA = document.getElementById("subtypeLabelA");
  const labelB = document.getElementById("subtypeLabelB");
  if (labelA) labelA.textContent = SUBTYPE_A.label;
  if (labelB) labelB.textContent = SUBTYPE_B.label;

  const dimLabel = seriesDimLabel();
  const ecoVolTitle = document.getElementById("ecosystemVolumeTitle");
  if (ecoVolTitle) {
    if (IS_MULTI_CROP) {
      const plural = String(CONFIG.groupPlural || `${dimLabel}s`);
      const pluralTitle = plural.charAt(0).toUpperCase() + plural.slice(1);
      ecoVolTitle.textContent = `Production Volume Comparison by ${pluralTitle}`;
    } else {
      ecoVolTitle.textContent = `Production Volume Comparison by ${dimLabel}`;
    }
  }
  const ecoVolNameTh = document.getElementById("ecosystemVolumeNameTh");
  if (ecoVolNameTh) {
    ecoVolNameTh.textContent = dimLabel;
    ecoVolNameTh.title = `Sort by ${dimLabel}`;
  }
  const regionEcoTitle = document.getElementById("regionEcosystemTitle");
  if (regionEcoTitle) {
    regionEcoTitle.textContent = `Regional Production Volume by ${dimLabel}`;
  }
  const thA = document.getElementById("regionEcoThA");
  const thB = document.getElementById("regionEcoThB");
  if (thA) {
    thA.textContent = SUBTYPE_A.label;
    thA.title = `Sort by ${SUBTYPE_A.label}`;
  }
  if (thB) {
    thB.textContent = SUBTYPE_B.label;
    thB.title = `Sort by ${SUBTYPE_B.label}`;
  }
  if (els.ecosystemTrendTitle) {
    els.ecosystemTrendTitle.textContent = ECOSYSTEM_METRICS.yield_mt_ha.title;
  }
}

function formatMt(value, { signed = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  const body = `${fmt.score(Math.abs(num))} MT`;
  if (!signed) return body;
  if (num > 0) return `+${body}`;
  if (num < 0) return `−${body}`;
  return body;
}

function formatHa(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${fmt.score(value)} ha`;
}

function formatYield(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${fmt.score(value, { compact: false })} MT/ha`;
}

function formatPctValue(value, { signed = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  const body = `${fmt.score(Math.abs(num), { compact: false })}%`;
  if (!signed) return body;
  if (num > 0) return `+${body}`;
  if (num < 0) return `−${body}`;
  return body;
}

function sentimentFromPct(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return "neutral";
  const abs = Math.abs(Number(pct));
  if (abs < 0.05) return "flat";
  return Number(pct) > 0 ? "up" : "down";
}

function sentimentLabel(sentiment) {
  if (sentiment === "up") return "Rising";
  if (sentiment === "down") return "Declining";
  if (sentiment === "flat") return "Stable";
  return "Mixed";
}

function analysisProductLabel() {
  if (IS_MULTI_CROP) {
    const plural = String(CONFIG.groupPlural || "crops");
    return plural.charAt(0).toUpperCase() + plural.slice(1);
  }
  return CONFIG.cropGroup || "Palay";
}

function analysisProductNoun() {
  if (IS_MULTI_CROP) {
    return CONFIG.groupNoun || CONFIG.groupLabel?.toLowerCase() || "crop";
  }
  return String(CONFIG.cropGroup || "Palay").toLowerCase();
}

function getActiveFilterScope() {
  const { year_from, year_to } = getYearRange();
  const yearNarrowed = year_from !== yearBounds.min || year_to !== defaultYearTo();
  const yearText = year_from === year_to ? String(year_from) : `${year_from} – ${year_to}`;
  const quarter = multiSelectDisplay(els.quarter, {
    formatLabel: (v) => `Q${v}`,
    maxNames: 4,
  });
  const semester = multiSelectDisplay(els.semester, {
    formatLabel: (v) => `S${v}`,
    maxNames: 2,
  });
  const ecosystem = multiSelectDisplay(els.crop, { maxNames: 2 });
  const region = multiSelectDisplay(els.region, { maxNames: 2 });
  const province = multiSelectDisplay(els.province, { maxNames: 2 });

  const chips = [
    { label: "Year", text: yearText, narrowed: yearNarrowed },
    { label: "Quarter", ...quarter },
    { label: "Semester", ...semester },
    { label: filterDimLabel(), ...ecosystem },
    { label: "Region", ...region },
    { label: "Province", ...province },
  ];

  const narrowed = chips.filter((c) => c.narrowed);
  let narrative;
  if (!narrowed.length) {
    if (IS_MULTI_CROP) {
      const label = CONFIG.groupPlural || "crops";
      narrative = `Nationwide ${label} view across ${yearText}, covering all quarters, semesters, regions, and provinces.`;
    } else {
      const dim = CONFIG.subtypePlural || "ecosystems";
      narrative = `Nationwide ${CONFIG.cropGroup || "Palay"} view across ${yearText}, covering all quarters, semesters, ${dim}, regions, and provinces.`;
    }
  } else {
    narrative = `Analysis is filtered to ${narrowed
      .map((c) => `${c.label.toLowerCase()} ${c.text}`)
      .join("; ")}.`;
  }
  return { chips, narrative, year_from, year_to, yearText, narrowedCount: narrowed.length };
}

function buildCompareRankings(points, nameKey, latestYear) {
  const previousYear = latestYear - 1;
  const byName = new Map();
  for (const p of points || []) {
    const name = p[nameKey];
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, { latest: null, previous: null });
    const row = byName.get(name);
    if (Number(p.year) === latestYear) row.latest = p.volume_mt;
    if (Number(p.year) === previousYear) row.previous = p.volume_mt;
  }

  const entries = [...byName.entries()]
    .map(([name, vals]) => {
      const latest =
        vals.latest != null && !Number.isNaN(Number(vals.latest)) ? Number(vals.latest) : null;
      const previous =
        vals.previous != null && !Number.isNaN(Number(vals.previous))
          ? Number(vals.previous)
          : null;
      const variance = latest != null && previous != null ? latest - previous : null;
      const growth =
        latest != null && previous != null && previous !== 0
          ? ((latest - previous) / previous) * 100
          : null;
      return { name, latest, previous, variance, growth };
    })
    .filter((e) => e.latest != null && e.latest !== 0);

  const byVolume = entries
    .slice()
    .sort(
      (a, b) =>
        (b.latest ?? -Infinity) - (a.latest ?? -Infinity) ||
        String(a.name).localeCompare(String(b.name))
    );
  const byGrowth = entries
    .filter((e) => e.growth != null)
    .slice()
    .sort((a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity));
  const byDecline = entries
    .filter((e) => e.growth != null)
    .slice()
    .sort((a, b) => (a.growth ?? Infinity) - (b.growth ?? Infinity));

  const latestTotal = entries.reduce((s, e) => s + (e.latest || 0), 0);
  return { entries, byVolume, byGrowth, byDecline, latestTotal };
}

function analysisStat(label, value, meta = "", tone = "") {
  return `<div class="analysis-stat${tone ? ` is-${tone}` : ""}">
    <span class="analysis-stat-label">${escapeHtml(label)}</span>
    <span class="analysis-stat-value">${escapeHtml(value)}</span>
    ${meta ? `<span class="analysis-stat-meta">${escapeHtml(meta)}</span>` : ""}
  </div>`;
}

function analysisSection(title, bodyHtml, { accent = false } = {}) {
  if (!bodyHtml) return "";
  return `<section class="analysis-section${accent ? " is-accent" : ""}">
    <h3 class="analysis-section-title">${escapeHtml(title)}</h3>
    ${bodyHtml}
  </section>`;
}

function analysisList(items, { ordered = false } = {}) {
  if (!items?.length) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag} class="analysis-list${ordered ? " is-ordered" : ""}">${items
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("")}</${tag}>`;
}

function buildSmartAnalysisModel(snapshot) {
  if (!snapshot) return null;

  const scope = getActiveFilterScope();
  const kpi = snapshot.kpi || {};
  const cmp = kpi.comparison || {};
  const yearFrom = snapshot.year_from;
  const yearTo = snapshot.year_to;
  const points = snapshot.seriesPoints || [];
  const bySubtype = kpi.by_subtype || [];
  const byPriority = kpi.by_priority_crop || [];
  const takeaways = [];
  const generatedAt = new Date();
  const productLabel = analysisProductLabel();
  const productNoun = analysisProductNoun();
  const showAreaYield = CONFIG.showAreaYield !== false;

  const avgYears = kpi.year_count || yearTo - yearFrom + 1;
  const avgMeta =
    avgYears === 1 ? `${yearFrom} · 1 year` : `${yearFrom}–${yearTo} · ${fmt.number(avgYears)}-year average`;

  let headline;
  let headlineSentiment = "neutral";
  if (cmp.growth_rate_pct != null) {
    headlineSentiment = sentimentFromPct(cmp.growth_rate_pct);
    headline = `Under the current filters, ${productLabel} production ${
      describeChange(cmp.growth_rate_pct) || "changed"
    } from ${cmp.year_from} to ${cmp.year_to}.`;
  } else if (points.length >= 2) {
    const volPct = pctChange(points[0].volume_mt, points[points.length - 1].volume_mt);
    headlineSentiment = sentimentFromPct(volPct);
    headline = `Under the current filters, ${productNoun} production volume ${
      describeChange(volPct) || "changed"
    } from ${points[0].year} to ${points[points.length - 1].year}.`;
  } else {
    headline = `Snapshot of ${productLabel} production for the selected filters.`;
  }

  const performanceStats = [
    { label: "Avg production", value: formatMt(kpi.volume_mt_avg), meta: avgMeta },
  ];
  if (showAreaYield) {
    performanceStats.push(
      { label: "Avg area harvested", value: formatHa(kpi.area_ha_avg), meta: avgMeta },
      { label: "Average yield", value: formatYield(kpi.yield_mt_ha), meta: "Volume ÷ area" }
    );
  }

  if (kpi.volume_mt_avg != null) {
    takeaways.push(`Average annual production is ${formatMt(kpi.volume_mt_avg)} over ${avgMeta}.`);
  }
  if (showAreaYield && kpi.yield_mt_ha != null) {
    takeaways.push(`Average yield stands at ${formatYield(kpi.yield_mt_ha)}.`);
  }

  let yoy = null;
  if (cmp.year_from != null && cmp.year_to != null) {
    const growthText =
      cmp.growth_rate_pct == null
        ? "Year-on-year growth is unavailable for this selection."
        : `Volume ${describeChange(cmp.growth_rate_pct) || "changed"} (${formatPctValue(
            cmp.growth_rate_pct,
            { signed: true }
          )}).`;
    yoy = {
      title: `Year-over-year · ${cmp.year_to} vs ${cmp.year_from}`,
      text: growthText,
      sentiment: sentimentFromPct(cmp.growth_rate_pct),
      stats: [
        { label: String(cmp.year_to), value: formatMt(cmp.volume_mt_to), meta: "Latest year" },
        { label: String(cmp.year_from), value: formatMt(cmp.volume_mt_from), meta: "Previous year" },
        {
          label: "Variance",
          value: formatMt(cmp.variance_mt, { signed: true }),
          meta: `${cmp.year_to} − ${cmp.year_from}`,
          tone: sentimentFromPct(cmp.variance_mt),
        },
        {
          label: "Growth rate",
          value: formatPctValue(cmp.growth_rate_pct, { signed: true }),
          meta: "Year-over-year",
          tone: sentimentFromPct(cmp.growth_rate_pct),
        },
      ],
    };
    if (cmp.growth_rate_pct != null) {
      takeaways.push(
        `${cmp.year_to} vs ${cmp.year_from}: ${formatPctValue(cmp.growth_rate_pct, {
          signed: true,
        })} (${formatMt(cmp.variance_mt, { signed: true })}).`
      );
    }
  }

  let trend = null;
  if (points.length) {
    const first = points[0];
    const last = points[points.length - 1];
    let peak = first;
    let low = first;
    for (const p of points) {
      if ((p.volume_mt ?? -Infinity) > (peak.volume_mt ?? -Infinity)) peak = p;
      if ((p.volume_mt ?? Infinity) < (low.volume_mt ?? Infinity)) low = p;
    }
    const volPct = pctChange(first.volume_mt, last.volume_mt);
    const areaPct = showAreaYield ? pctChange(first.area_ha, last.area_ha) : null;
    const yieldFirst = showAreaYield ? yieldForPoint(first) : null;
    const yieldLast = showAreaYield ? yieldForPoint(last) : null;
    const yieldPct = showAreaYield ? pctChange(yieldFirst, yieldLast) : null;
    const bullets = [
      `From ${first.year} to ${last.year}, volume ${describeChange(volPct) || "changed"} (${formatMt(
        first.volume_mt
      )} -> ${formatMt(last.volume_mt)}).`,
    ];
    if (showAreaYield) {
      bullets.push(
        `Area harvested ${describeChange(areaPct) || "changed"} (${formatHa(first.area_ha)} -> ${formatHa(
          last.area_ha
        )}).`,
        `Yield ${describeChange(yieldPct) || "changed"} (${formatYield(yieldFirst)} -> ${formatYield(
          yieldLast
        )}).`
      );
    }
    bullets.push(
      `Highest volume: ${peak.year} at ${formatMt(peak.volume_mt)}.`,
      `Lowest volume: ${low.year} at ${formatMt(low.volume_mt)}.`
    );
    if (showAreaYield && volPct != null && areaPct != null && Math.abs(volPct - areaPct) >= 5) {
      bullets.push(
        volPct > areaPct
          ? "Volume outpaced area harvested, indicating stronger average yields over the period."
          : "Area harvested grew faster than volume, pointing to softer average yields over the period."
      );
    }
    trend = {
      title: `Trend · ${yearFrom}–${yearTo}`,
      bullets,
      stats: [
        { label: "Start volume", value: formatMt(first.volume_mt), meta: String(first.year) },
        { label: "End volume", value: formatMt(last.volume_mt), meta: String(last.year) },
        { label: "Peak year", value: String(peak.year), meta: formatMt(peak.volume_mt) },
        { label: "Low year", value: String(low.year), meta: formatMt(low.volume_mt) },
      ],
    };
    if (peak.year) {
      takeaways.push(`Peak production year in range: ${peak.year} (${formatMt(peak.volume_mt)}).`);
    }
  }

  let growthPattern = null;
  const growth = buildVolumeYoYGrowth(snapshot.seriesPointsForGrowth || []);
  const growthPairs = (growth.labels || [])
    .map((year, i) => ({
      year,
      growth: growth.values[i],
      volume: growth.currentVolumes[i],
      previous: growth.previousVolumes[i],
    }))
    .filter((row) => row.growth != null && !Number.isNaN(row.growth));
  if (growthPairs.length) {
    let peak = growthPairs[0];
    let trough = growthPairs[0];
    let upYears = 0;
    let downYears = 0;
    for (const row of growthPairs) {
      if (row.growth > peak.growth) peak = row;
      if (row.growth < trough.growth) trough = row;
      if (row.growth > 0) upYears += 1;
      else if (row.growth < 0) downYears += 1;
    }
    const latest = growthPairs[growthPairs.length - 1];
    growthPattern = {
      title: "Year-on-year growth pattern",
      bullets: [
        `Latest measured YoY growth (${latest.year}): ${formatPctValue(latest.growth, {
          signed: true,
        })}.`,
        `Strongest growth year: ${peak.year} at ${formatPctValue(peak.growth, { signed: true })}.`,
        `Weakest growth year: ${trough.year} at ${formatPctValue(trough.growth, { signed: true })}.`,
        `Across ${growthPairs.length} comparable years, volume rose in ${upYears} and fell in ${downYears}.`,
      ],
      stats: [
        {
          label: "Latest YoY",
          value: formatPctValue(latest.growth, { signed: true }),
          meta: String(latest.year),
          tone: sentimentFromPct(latest.growth),
        },
        {
          label: "Best year",
          value: formatPctValue(peak.growth, { signed: true }),
          meta: String(peak.year),
          tone: "up",
        },
        {
          label: "Weakest year",
          value: formatPctValue(trough.growth, { signed: true }),
          meta: String(trough.year),
          tone: "down",
        },
        {
          label: "Up vs down years",
          value: `${upYears} / ${downYears}`,
          meta: `${growthPairs.length} comparable years`,
        },
      ],
    };
  }

  let ecosystem = null;
  let priorityCrops = null;
  let topCrops = null;

  if (IS_MULTI_CROP && byPriority.length) {
    const bullets = byPriority.map(
      (row) =>
        `${row.crop_group}: ${formatMt(row.volume_mt_avg)} average` +
        (row.share_pct != null ? ` (${formatPctValue(row.share_pct)} of total production).` : ".")
    );
    const leader = byPriority.reduce(
      (best, row) =>
        (row.volume_mt_avg || 0) > (best?.volume_mt_avg || 0) ? row : best,
      byPriority[0]
    );
    if (leader?.crop_group) {
      bullets.push(
        `${leader.crop_group} leads the priority set in average volume under the current filters.`
      );
      if (leader.share_pct != null) {
        takeaways.push(
          `${leader.crop_group} accounts for about ${formatPctValue(leader.share_pct)} of production in this view.`
        );
      }
    }
    priorityCrops = {
      title: CONFIG.priorityCropTopN
        ? `Top ${analysisProductLabel()} commodities`
        : "Priority crops",
      bullets,
      stats: byPriority.map((row) => ({
        label: row.crop_group,
        value: formatMt(row.volume_mt_avg),
        meta:
          row.share_pct != null
            ? `${formatPctValue(row.share_pct)} of total`
            : "Average volume",
      })),
    };
  } else if (!IS_MULTI_CROP && CONFIG.showSubtypeAverages !== false && bySubtype.length) {
    const subtypeA =
      bySubtype.find((r) => r.crop_subtype === SUBTYPE_A.value) || bySubtype[0] || {};
    const subtypeB =
      bySubtype.find((r) => r.crop_subtype === SUBTYPE_B.value) || bySubtype[1] || {};
    const lead =
      (subtypeA.volume_mt_avg || 0) >= (subtypeB.volume_mt_avg || 0) ? subtypeA : subtypeB;
    const lag = lead === subtypeA ? subtypeB : subtypeA;
    const bullets = [
      `${SUBTYPE_A.label}: ${formatMt(subtypeA.volume_mt_avg)} average` +
        (subtypeA.share_pct != null
          ? ` (${formatPctValue(subtypeA.share_pct)} of selected production).`
          : "."),
      `${SUBTYPE_B.label}: ${formatMt(subtypeB.volume_mt_avg)} average` +
        (subtypeB.share_pct != null
          ? ` (${formatPctValue(subtypeB.share_pct)} of selected production).`
          : "."),
    ];
    if (lead.crop_subtype && lag.crop_subtype) {
      bullets.push(
        `${lead.crop_subtype} leads ${lag.crop_subtype} in average volume under the current filters.`
      );
    }
    ecosystem = {
      title: `${CONFIG.subtypeLabel || "Ecosystem"} mix`,
      bullets,
      stats: [
        {
          label: SUBTYPE_A.label,
          value: formatMt(subtypeA.volume_mt_avg),
          meta:
            subtypeA.share_pct != null
              ? `${formatPctValue(subtypeA.share_pct)} share`
              : "Average volume",
        },
        {
          label: SUBTYPE_B.label,
          value: formatMt(subtypeB.volume_mt_avg),
          meta:
            subtypeB.share_pct != null
              ? `${formatPctValue(subtypeB.share_pct)} share`
              : "Average volume",
        },
      ],
    };
    if (lead.crop_subtype && lead.share_pct != null) {
      takeaways.push(
        `${lead.crop_subtype} accounts for about ${formatPctValue(lead.share_pct)} of production in this view.`
      );
    }
  }

  if (IS_MULTI_CROP) {
    const cropRank = buildCompareRankings(snapshot.ecoComparePoints, "crop_subtype", yearTo);
    if (cropRank.byVolume.length) {
      const top = cropRank.byVolume.slice(0, 5);
      const gainers = cropRank.byGrowth.filter((e) => e.growth > 0).slice(0, 3);
      const decliners = cropRank.byDecline.filter((e) => e.growth < 0).slice(0, 3);
      const plural = String(CONFIG.groupPlural || "crops");
      const pluralTitle = plural.charAt(0).toUpperCase() + plural.slice(1);
      const ranks = top.map((e, i) => {
        const share =
          cropRank.latestTotal > 0 ? (e.latest / cropRank.latestTotal) * 100 : null;
        return {
          rank: i + 1,
          name: e.name,
          volume: formatMt(e.latest),
          share: share != null ? formatPctValue(share) : null,
          growth: e.growth != null ? formatPctValue(e.growth, { signed: true }) : null,
          tone: sentimentFromPct(e.growth),
        };
      });
      const bullets = [];
      if (gainers.length) {
        bullets.push(
          `Fastest gains among ${plural}: ${gainers
            .map((e) => `${e.name} (${formatPctValue(e.growth, { signed: true })})`)
            .join(", ")}.`
        );
      }
      if (decliners.length) {
        bullets.push(
          `Largest declines among ${plural}: ${decliners
            .map((e) => `${e.name} (${formatPctValue(e.growth, { signed: true })})`)
            .join(", ")}.`
        );
      }
      topCrops = { title: `Top ${pluralTitle} · ${yearTo}`, ranks, bullets };
      if (top[0]) {
        takeaways.push(
          `Top ${productNoun} by volume in ${yearTo}: ${top[0].name} (${formatMt(top[0].latest)}).`
        );
      }
    }
  }

  const regionRank = buildCompareRankings(snapshot.regionComparePoints, "region", yearTo);
  let regions = null;
  if (regionRank.byVolume.length) {
    const top = regionRank.byVolume.slice(0, 3);
    const gainers = regionRank.byGrowth.filter((e) => e.growth > 0).slice(0, 3);
    const decliners = regionRank.byDecline.filter((e) => e.growth < 0).slice(0, 3);
    const ranks = top.map((e, i) => {
      const share =
        regionRank.latestTotal > 0 ? (e.latest / regionRank.latestTotal) * 100 : null;
      return {
        rank: i + 1,
        name: e.name,
        volume: formatMt(e.latest),
        share: share != null ? formatPctValue(share) : null,
        growth: e.growth != null ? formatPctValue(e.growth, { signed: true }) : null,
        tone: sentimentFromPct(e.growth),
      };
    });
    const bullets = [];
    if (gainers.length) {
      bullets.push(
        `Fastest regional gains: ${gainers
          .map((e) => `${e.name} (${formatPctValue(e.growth, { signed: true })})`)
          .join(", ")}.`
      );
    }
    if (decliners.length) {
      bullets.push(
        `Largest regional declines: ${decliners
          .map((e) => `${e.name} (${formatPctValue(e.growth, { signed: true })})`)
          .join(", ")}.`
      );
    }
    regions = { title: `Regional leaders · ${yearTo}`, ranks, bullets };
    if (top[0]) {
      takeaways.push(
        `Top region by volume in ${yearTo}: ${top[0].name} (${formatMt(top[0].latest)}).`
      );
    }
  }

  const provinceRank = buildCompareRankings(
    snapshot.provinceComparePoints,
    "province",
    yearTo
  );
  let provinces = null;
  if (provinceRank.byVolume.length) {
    const top = provinceRank.byVolume.slice(0, 5);
    const gainers = provinceRank.byGrowth.filter((e) => e.growth > 0).slice(0, 3);
    const decliners = provinceRank.byDecline.filter((e) => e.growth < 0).slice(0, 3);
    const ranks = top.map((e, i) => ({
      rank: i + 1,
      name: e.name,
      volume: formatMt(e.latest),
      share: null,
      growth: e.growth != null ? formatPctValue(e.growth, { signed: true }) : null,
      tone: sentimentFromPct(e.growth),
    }));
    const bullets = [];
    if (gainers.length) {
      bullets.push(
        `Notable provincial gains: ${gainers
          .map((e) => `${e.name} (${formatPctValue(e.growth, { signed: true })})`)
          .join(", ")}.`
      );
    }
    if (decliners.length) {
      bullets.push(
        `Notable provincial declines: ${decliners
          .map((e) => `${e.name} (${formatPctValue(e.growth, { signed: true })})`)
          .join(", ")}.`
      );
    }
    provinces = { title: `Provincial leaders · ${yearTo}`, ranks, bullets };
  }

  return {
    title: CONFIG.title || "Production Dashboard",
    slug: CONFIG.slug || "dashboard",
    crop: productLabel,
    generatedAt,
    generatedLabel: generatedAt.toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    scope,
    headline,
    headlineSentiment,
    performanceStats,
    yoy,
    trend,
    growthPattern,
    ecosystem,
    priorityCrops,
    topCrops,
    regions,
    provinces,
    takeaways: takeaways.slice(0, 6),
    sourceNote:
      "Source: Philippine Statistics Authority (PSA) OpenStat, processed by AgriStat Data Analytics Platform · Department of Agriculture.",
  };
}

function renderRankCards(ranks) {
  if (!ranks?.length) return "";
  return `<div class="analysis-ranks">${ranks
    .map(
      (r) => `<article class="analysis-rank-card">
      <span class="analysis-rank-badge">#${r.rank}</span>
      <div class="analysis-rank-body">
        <strong class="analysis-rank-name">${escapeHtml(r.name)}</strong>
        <span class="analysis-rank-meta">${escapeHtml(r.volume)}${
          r.share ? ` · ${escapeHtml(r.share)} share` : ""
        }</span>
      </div>
      ${
        r.growth
          ? `<span class="analysis-rank-growth is-${r.tone || "neutral"}">${escapeHtml(
              r.growth
            )}</span>`
          : ""
      }
    </article>`
    )
    .join("")}</div>`;
}

function renderSmartAnalysisHtml(model) {
  if (!model) {
    return `<p class="analysis-empty">No dashboard data is loaded yet. Adjust filters or wait for data to finish loading, then try again.</p>`;
  }

  const scopeChips = model.scope.chips
    .map(
      (chip) =>
        `<span class="analysis-scope-chip${chip.narrowed ? " is-narrowed" : ""}"><span class="analysis-scope-chip-label">${escapeHtml(
          chip.label
        )}</span><span class="analysis-scope-chip-value">${escapeHtml(chip.text)}</span></span>`
    )
    .join("");

  const statsHtml = (stats) =>
    stats?.length
      ? `<div class="analysis-stats">${stats
          .map((s) => analysisStat(s.label, s.value, s.meta || "", s.tone || ""))
          .join("")}</div>`
      : "";

  const performanceBody = `
    <div class="analysis-hero">
      <span class="analysis-sentiment is-${model.headlineSentiment}">${escapeHtml(
        sentimentLabel(model.headlineSentiment)
      )}</span>
      <p class="analysis-lead">${escapeHtml(model.headline)}</p>
      <p class="analysis-text">${escapeHtml(model.scope.narrative)}</p>
    </div>
    ${statsHtml(model.performanceStats)}
  `;

  const yoyBody = model.yoy
    ? `<p class="analysis-text">${escapeHtml(model.yoy.text)}</p>${statsHtml(model.yoy.stats)}`
    : `<p class="analysis-text">Year-over-year comparison is not available for the current filters.</p>`;

  const trendBody = model.trend
    ? `${statsHtml(model.trend.stats)}${analysisList(model.trend.bullets)}`
    : `<p class="analysis-text">No annual trend points are available for the current filters.</p>`;

  const growthBody = model.growthPattern
    ? `${statsHtml(model.growthPattern.stats)}${analysisList(model.growthPattern.bullets)}`
    : `<p class="analysis-text">Year-on-year growth series is not available for this selection (needs consecutive years with volume).</p>`;

  const ecosystemBody = model.ecosystem
    ? `${statsHtml(model.ecosystem.stats)}${analysisList(model.ecosystem.bullets)}`
    : "";

  const priorityCropsBody = model.priorityCrops
    ? `${statsHtml(model.priorityCrops.stats)}${analysisList(model.priorityCrops.bullets)}`
    : "";

  const topCropsBody = model.topCrops
    ? `${renderRankCards(model.topCrops.ranks)}${analysisList(model.topCrops.bullets)}`
    : "";

  const regionBody = model.regions
    ? `${renderRankCards(model.regions.ranks)}${analysisList(model.regions.bullets)}`
    : `<p class="analysis-text">No regional comparison rows are available for the current filters.</p>`;

  const provinceBody = model.provinces
    ? `${renderRankCards(model.provinces.ranks)}${analysisList(model.provinces.bullets)}`
    : `<p class="analysis-text">No provincial comparison rows are available for the current filters.</p>`;

  const takeawaysBody = model.takeaways.length
    ? analysisList(model.takeaways, { ordered: true })
    : "";

  return `
    <div class="analysis-meta-bar">
      <span>Generated ${escapeHtml(model.generatedLabel)}</span>
      <span>${escapeHtml(model.crop)} · filter-aware report</span>
    </div>
    <div class="analysis-scope">${scopeChips}</div>
    ${analysisSection("Executive summary", performanceBody, { accent: true })}
    ${analysisSection(model.yoy?.title || "Year-over-year", yoyBody)}
    ${analysisSection(model.trend?.title || "Trend", trendBody)}
    ${analysisSection(model.growthPattern?.title || "Year-on-year growth pattern", growthBody)}
    ${analysisSection(model.priorityCrops?.title || "Priority crops", priorityCropsBody)}
    ${analysisSection(model.topCrops?.title || "Top crops", topCropsBody)}
    ${analysisSection(model.ecosystem?.title || "Ecosystem mix", ecosystemBody)}
    ${analysisSection(model.regions?.title || "Regional leaders", regionBody)}
    ${analysisSection(model.provinces?.title || "Provincial leaders", provinceBody)}
    ${analysisSection("Key takeaways", takeawaysBody, { accent: true })}
    <p class="analysis-source">${escapeHtml(model.sourceNote)}</p>
  `;
}

function buildSmartAnalysisReport(snapshot) {
  latestAnalysisModel = buildSmartAnalysisModel(snapshot);
  return renderSmartAnalysisHtml(latestAnalysisModel);
}

function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-jspdf]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jspdf.jsPDF));
      existing.addEventListener("error", () => reject(new Error("Failed to load PDF library")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
    script.async = true;
    script.dataset.jspdf = "true";
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = () => reject(new Error("Failed to load PDF library"));
    document.head.appendChild(script);
  });
}

function analysisPdfFilename(model) {
  const stamp = (model?.generatedAt || new Date()).toISOString().slice(0, 10);
  const yearFrom = model?.scope?.year_from ?? "";
  const yearTo = model?.scope?.year_to ?? "";
  const slug = model?.slug || CONFIG.slug || "dashboard";
  return `${slug}-smart-analysis_${yearFrom}-${yearTo}_${stamp}.pdf`;
}

/** jsPDF Helvetica is WinAnsi-only; Unicode punctuation breaks glyph layout. */
function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/\u2212/g, "-") // minus sign −
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-") // hyphen/dashes
    .replace(/\u00AD/g, "") // soft hyphen
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2022|\u00B7|\u2027|\u2219/g, "-") // bullets / middle dots
    .replace(/\u2192|\u2794|\u279C/g, "->")
    .replace(/\u00A0|\u202F|\u2007|\u2009/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

async function downloadSmartAnalysisPdf(model) {
  if (!model) throw new Error("No analysis available to download.");
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const marginTop = 18;
  const marginBottom = 18;
  const maxWidth = pageWidth - marginX * 2;
  let y = marginTop;
  let page = 1;

  const ensureSpace = (needed = 8) => {
    if (y + needed <= pageHeight - marginBottom) return;
    doc.addPage();
    page += 1;
    y = marginTop;
  };

  const writeWrapped = (text, { size = 10, style = "normal", color = [33, 37, 41], gap = 4 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(sanitizePdfText(text), maxWidth);
    for (const line of lines) {
      ensureSpace(size * 0.45 + 2);
      doc.text(line, marginX, y);
      y += size * 0.45 + 1.2;
    }
    y += gap;
  };

  const writeSectionTitle = (title) => {
    ensureSpace(14);
    y += 2;
    doc.setDrawColor(9, 102, 63);
    doc.setFillColor(9, 102, 63);
    doc.rect(marginX, y - 3.5, 1.6, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(9, 102, 63);
    doc.text(sanitizePdfText(title).toUpperCase(), marginX + 4, y);
    y += 7;
  };

  const writeBullets = (items) => {
    for (const item of items || []) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(33, 37, 41);
      const lines = doc.splitTextToSize(sanitizePdfText(`-  ${item}`), maxWidth);
      for (const line of lines) {
        ensureSpace(7);
        doc.text(line, marginX, y);
        y += 5.2;
      }
      y += 1;
    }
    y += 2;
  };

  const writeStats = (stats) => {
    for (const stat of stats || []) {
      writeWrapped(`${stat.label}: ${stat.value}${stat.meta ? `  (${stat.meta})` : ""}`, {
        size: 10,
        style: "normal",
        gap: 1.5,
      });
    }
    y += 2;
  };

  // Cover header
  doc.setFillColor(6, 64, 43);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Smart Analysis Report", marginX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(sanitizePdfText(model.title), marginX, 19);
  doc.text(sanitizePdfText(`Generated ${model.generatedLabel}`), marginX, 25);
  y = 36;

  writeWrapped(`Outlook: ${sentimentLabel(model.headlineSentiment)}`, {
    size: 11,
    style: "bold",
    color: [9, 102, 63],
    gap: 2,
  });
  writeWrapped(model.headline, { size: 11, style: "bold", gap: 3 });
  writeWrapped(model.scope.narrative, { size: 10, gap: 4 });

  writeSectionTitle("Active filters");
  for (const chip of model.scope.chips) {
    writeWrapped(`${chip.label}: ${chip.text}${chip.narrowed ? "  [filtered]" : ""}`, {
      size: 10,
      gap: 1,
    });
  }
  y += 2;

  writeSectionTitle("Executive summary");
  writeStats(model.performanceStats);

  if (model.yoy) {
    writeSectionTitle(model.yoy.title);
    writeWrapped(model.yoy.text, { size: 10, gap: 2 });
    writeStats(model.yoy.stats);
  }

  if (model.trend) {
    writeSectionTitle(model.trend.title);
    writeStats(model.trend.stats);
    writeBullets(model.trend.bullets);
  }

  if (model.growthPattern) {
    writeSectionTitle(model.growthPattern.title);
    writeStats(model.growthPattern.stats);
    writeBullets(model.growthPattern.bullets);
  }

  if (model.priorityCrops) {
    writeSectionTitle(model.priorityCrops.title);
    writeStats(model.priorityCrops.stats);
    writeBullets(model.priorityCrops.bullets);
  }

  if (model.topCrops) {
    writeSectionTitle(model.topCrops.title);
    writeBullets(
      model.topCrops.ranks.map(
        (r) =>
          `#${r.rank} ${r.name}: ${r.volume}` +
          (r.share ? ` (${r.share} share)` : "") +
          (r.growth ? `, YoY ${r.growth}` : "")
      )
    );
    writeBullets(model.topCrops.bullets);
  }

  if (model.ecosystem) {
    writeSectionTitle(model.ecosystem.title);
    writeStats(model.ecosystem.stats);
    writeBullets(model.ecosystem.bullets);
  }

  if (model.regions) {
    writeSectionTitle(model.regions.title);
    writeBullets(
      model.regions.ranks.map(
        (r) =>
          `#${r.rank} ${r.name}: ${r.volume}` +
          (r.share ? ` (${r.share} share)` : "") +
          (r.growth ? `, YoY ${r.growth}` : "")
      )
    );
    writeBullets(model.regions.bullets);
  }

  if (model.provinces) {
    writeSectionTitle(model.provinces.title);
    writeBullets(
      model.provinces.ranks.map(
        (r) =>
          `#${r.rank} ${r.name}: ${r.volume}` + (r.growth ? ` (${r.growth} YoY)` : "")
      )
    );
    writeBullets(model.provinces.bullets);
  }

  if (model.takeaways.length) {
    writeSectionTitle("Key takeaways");
    writeBullets(model.takeaways.map((t, i) => `${i + 1}. ${t}`));
  }

  writeWrapped(model.sourceNote, { size: 8, color: [100, 116, 110], gap: 0 });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 125);
    doc.text(
      `AgriStat · Department of Agriculture · Page ${i} of ${totalPages}`,
      marginX,
      pageHeight - 8
    );
  }

  doc.save(analysisPdfFilename(model));
}

function ensureSmartAnalysisModal() {
  let modal = document.getElementById("smartAnalysisModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "smartAnalysisModal";
  modal.className = "app-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "smartAnalysisTitle");
  modal.innerHTML = `
    <div class="app-modal-backdrop" data-analysis-dismiss="true"></div>
    <div class="app-modal-panel app-modal-panel-analysis">
      <div class="app-modal-analysis-header">
        <div>
          <h2 class="app-modal-title" id="smartAnalysisTitle">Smart Analysis</h2>
          <p class="app-modal-analysis-sub" id="smartAnalysisSub">Filter-aware summary of the current dashboard view</p>
        </div>
        <button type="button" class="app-modal-close" data-analysis-dismiss="true" aria-label="Close analysis">×</button>
      </div>
      <div class="app-modal-analysis-body" id="smartAnalysisBody">
        <p class="analysis-loading">Building analysis…</p>
      </div>
      <div class="app-modal-analysis-footer">
        <button type="button" class="app-modal-btn app-modal-btn-secondary" data-analysis-dismiss="true">Close</button>
        <button type="button" class="app-modal-btn app-modal-btn-primary" id="smartAnalysisDownloadPdf" disabled>
          Download PDF
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

async function openSmartAnalysisModal() {
  const modal = ensureSmartAnalysisModal();
  if (!modal.hidden) return;

  const body = modal.querySelector("#smartAnalysisBody");
  const sub = modal.querySelector("#smartAnalysisSub");
  const downloadBtn = modal.querySelector("#smartAnalysisDownloadPdf");
  const previouslyFocused = document.activeElement;
  const closeBtn = modal.querySelector(".app-modal-close");

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    modal.removeEventListener("keydown", onKeyDown);
    modal.querySelectorAll("[data-analysis-dismiss]").forEach((el) => {
      el.removeEventListener("click", onDismiss);
    });
    downloadBtn?.removeEventListener("click", onDownload);
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  };

  const onDismiss = () => close();
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  const onDownload = async () => {
    if (!latestAnalysisModel || !downloadBtn) return;
    const original = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Preparing PDF…";
    try {
      await downloadSmartAnalysisPdf(latestAnalysisModel);
    } catch (err) {
      downloadBtn.textContent = "Download failed";
      setTimeout(() => {
        downloadBtn.textContent = original;
        downloadBtn.disabled = false;
      }, 1600);
      return;
    }
    downloadBtn.textContent = "Downloaded";
    setTimeout(() => {
      downloadBtn.textContent = original;
      downloadBtn.disabled = false;
    }, 1200);
  };

  modal.querySelectorAll("[data-analysis-dismiss]").forEach((el) => {
    el.addEventListener("click", onDismiss);
  });
  downloadBtn?.addEventListener("click", onDownload);
  modal.addEventListener("keydown", onKeyDown);

  if (body) body.innerHTML = `<p class="analysis-loading">Building analysis from current filters…</p>`;
  if (downloadBtn) {
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Download PDF";
  }
  if (sub) {
    const { year_from, year_to } = getYearRange();
    sub.textContent = `${CONFIG.title} · ${year_from}–${year_to} · updates with your filters`;
  }

  modal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => closeBtn?.focus());

  try {
    await refreshDashboard();
    latestAnalysisModel = buildSmartAnalysisModel(dashboardSnapshot);
    if (body) body.innerHTML = renderSmartAnalysisHtml(latestAnalysisModel);
    if (downloadBtn) downloadBtn.disabled = !latestAnalysisModel;
  } catch (err) {
    latestAnalysisModel = null;
    if (body) {
      body.innerHTML = `<p class="analysis-empty">Could not build analysis: ${escapeHtml(
        err.message || "Unknown error"
      )}</p>`;
    }
    if (downloadBtn) downloadBtn.disabled = true;
  }
}

function bindSmartAnalysis() {
  const btn = document.getElementById("smartAnalysisBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    openSmartAnalysisModal().catch(() => {});
  });
}

function ensureLeaveModal() {
  let modal = document.getElementById("leaveDashboardModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "leaveDashboardModal";
  modal.className = "app-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "leaveDashboardTitle");
  modal.innerHTML = `
    <div class="app-modal-backdrop" data-leave-dismiss="true"></div>
    <div class="app-modal-panel">
      <h2 class="app-modal-title" id="leaveDashboardTitle">Leave this dashboard?</h2>
      <p class="app-modal-text">You will return to the Data Analytics Platform home.</p>
      <div class="app-modal-actions">
        <button type="button" class="app-modal-btn app-modal-btn-secondary" data-leave-dismiss="true">Stay</button>
        <button type="button" class="app-modal-btn app-modal-btn-primary" id="leaveDashboardConfirm">Leave</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openLeaveModal(onConfirm) {
  const modal = ensureLeaveModal();
  if (!modal.hidden) return;

  const confirmBtn = modal.querySelector("#leaveDashboardConfirm");
  const previouslyFocused = document.activeElement;

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    modal.removeEventListener("keydown", onKeyDown);
    confirmBtn?.removeEventListener("click", onConfirmClick);
    modal.querySelectorAll("[data-leave-dismiss]").forEach((el) => {
      el.removeEventListener("click", onDismiss);
    });
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  };

  const onDismiss = () => close();
  const onConfirmClick = () => {
    close();
    onConfirm?.();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  modal.querySelectorAll("[data-leave-dismiss]").forEach((el) => {
    el.addEventListener("click", onDismiss);
  });
  confirmBtn?.addEventListener("click", onConfirmClick);
  modal.addEventListener("keydown", onKeyDown);

  modal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    confirmBtn?.focus();
  });
}

function requestLeaveDashboard(href = "/") {
  openLeaveModal(() => {
    window.location.href = href;
  });
}

function bindLeaveGuards() {
  const homeTargets = [
    document.getElementById("homeLink"),
    document.getElementById("brandHomeLink"),
  ];
  homeTargets.forEach((el) => {
    el?.addEventListener("click", (event) => {
      event.preventDefault();
      requestLeaveDashboard(el.getAttribute("href") || "/");
    });
  });

  // Keep the user on this page until they confirm leave (browser Back included).
  const guardState = { agriStatDashboardGuard: true };
  history.pushState(guardState, "", location.href);
  window.addEventListener("popstate", () => {
    history.pushState(guardState, "", location.href);
    requestLeaveDashboard("/");
  });
}

function bind() {
  applyDashboardConfig();
  bindRawTips();
  bindSortableTables();
  ["quarter", "semester", "crop", "region", "province"].forEach((id) => {
    const group = els[id];
    if (!group) return;
    syncMultiSelectSummary(group);

    const toggle = group.querySelector(".multi-select-toggle");
    toggle?.addEventListener("click", (event) => {
      event.preventDefault();
      const willOpen = !group.classList.contains("is-open");
      closeAllMultiSelects(group);
      setMultiSelectOpen(group, willOpen);
    });

    group.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-multi-action]");
      if (!actionBtn || !group.contains(actionBtn)) return;
      event.preventDefault();
      const action = actionBtn.dataset.multiAction;
      const searchInput = group.querySelector(".multi-select-search-input");
      const searchActive = Boolean(searchInput?.value?.trim());
      // Crop filter: "Deselect all" must clear every option, not only search matches.
      // With 100+ vegetables, users search then narrow — partial clear left hidden
      // selections checked and the dashboard stayed unfiltered.
      const visibleOnly = id === "crop" ? false : searchActive;
      if (action === "select-all") checkAllValues(group, { visibleOnly: searchActive });
      else if (action === "clear") {
        clearAllValues(group, { visibleOnly });
        if (id === "crop") resetMultiSelectSearch(group);
      }
      else return;
      if (id === "quarter" || id === "semester") syncPeriodFilters(id);
      if (id === "region") populateProvinces(true);
      markActiveFilterIcons();
      refreshDashboard().catch((err) => console.error("Dashboard refresh failed:", err));
    });

    group.addEventListener("input", (event) => {
      if (!event.target?.matches?.(".multi-select-search-input")) return;
      filterMultiSelectOptions(group, event.target.value);
    });

    group.addEventListener("keydown", (event) => {
      if (!event.target?.matches?.(".multi-select-search-input")) return;
      if (event.key === "Enter") event.preventDefault();
      if (event.key === "Escape") {
        event.stopPropagation();
        setMultiSelectOpen(group, false);
        group.querySelector(".multi-select-toggle")?.focus();
      }
    });

    group.addEventListener("change", (event) => {
      if (event.target && event.target.matches('input[type="checkbox"]')) {
        ensureAtLeastOne(group);
      }
      if (id === "quarter" || id === "semester") syncPeriodFilters(id);
      if (id === "region") populateProvinces(true);
      syncMultiSelectSummary(group);
      markActiveFilterIcons();
      refreshDashboard().catch((err) => console.error("Dashboard refresh failed:", err));
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".multi-select")) return;
    closeAllMultiSelects();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllMultiSelects();
  });

  els.ecosystemMetric?.addEventListener("change", () => {
    renderEcosystemTrendChart();
  });
  els.regionEcosystemMetric?.addEventListener("change", () => {
    renderRegionEcosystemTable();
  });
  els.provinceVolumeTopN?.addEventListener("change", () => {
    renderProvinceVolumeTableFromCache();
  });
  els.ecosystemVolumeTopN?.addEventListener("change", () => {
    if (ecoVolumeLatestYear == null) return;
    renderEcosystemVolumeTable(ecoVolumeLatestYear, ecoVolumePoints);
  });

  const onYearFromInput = () => {
    activeYearThumb = "from";
    if (Number(els.yearFrom.value) > Number(els.yearTo.value)) {
      els.yearTo.value = els.yearFrom.value;
    }
    scheduleYearRefresh();
  };
  const onYearToInput = () => {
    activeYearThumb = "to";
    if (Number(els.yearTo.value) < Number(els.yearFrom.value)) {
      els.yearFrom.value = els.yearTo.value;
    }
    scheduleYearRefresh();
  };
  const markThumb = (which) => () => {
    activeYearThumb = which;
    syncYearRangeUI();
  };
  els.yearFrom.addEventListener("pointerdown", markThumb("from"));
  els.yearTo.addEventListener("pointerdown", markThumb("to"));
  els.yearFrom.addEventListener("focus", markThumb("from"));
  els.yearTo.addEventListener("focus", markThumb("to"));
  els.yearFrom.addEventListener("input", onYearFromInput);
  els.yearTo.addEventListener("input", onYearToInput);

  els.refreshBtn?.addEventListener("click", () => {
    triggerRefresh().catch((err) =>
      renderStatus({ status: "error", message: err.message, last_error: err.message })
    );
  });
  document.getElementById("resetFiltersBtn")?.addEventListener("click", resetFilters);

  const layout = document.getElementById("appLayout");
  const sidebar = document.getElementById("app-sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const menuToggle = document.getElementById("menuToggle");
  const collapseToggle = document.getElementById("sidebarCollapseToggle");
  const collapseBtn = document.getElementById("sidebarCollapseBtn");
  const collapseLabel = collapseBtn?.querySelector(".sidebar-collapse-label");
  const storageKey = `${CONFIG.slug || DATASET}-dashboard-sidebar-collapsed`;
  bindLeaveGuards();
  bindSmartAnalysis();

  function setSidebarCollapsed(collapsed) {
    if (!layout || !sidebar) return;
    closeAllMultiSelects();
    layout.classList.toggle("sidebar-collapsed", collapsed);
    sidebar.classList.toggle("is-collapsed", collapsed);
    sidebar.setAttribute("aria-expanded", collapsed ? "false" : "true");

    const label = collapsed ? "Show Filter" : "Hide Filter";
    [collapseToggle, collapseBtn].forEach((btn) => {
      if (!btn) return;
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
    if (collapseLabel) collapseLabel.textContent = collapsed ? "Show Filter" : "Hide Filter";

    try {
      localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }

    requestAnimationFrame(() => {
      if (trendChart) trendChart.resize();
      if (volumeGrowthChart) volumeGrowthChart.resize();
      if (yieldTrendChart) yieldTrendChart.resize();
      if (ecosystemTrendChart) ecosystemTrendChart.resize();
    });
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(!layout.classList.contains("sidebar-collapsed"));
  }

  try {
    // Always open dashboards with a collapsed filter sidebar.
    setSidebarCollapsed(true);
  } catch {
    setSidebarCollapsed(true);
  }

  collapseToggle?.addEventListener("click", toggleSidebarCollapsed);
  collapseBtn?.addEventListener("click", toggleSidebarCollapsed);

  document.querySelectorAll(".filter-field").forEach((field) => {
    field.addEventListener("click", (event) => {
      if (!sidebar?.classList.contains("is-collapsed")) return;
      if (window.innerWidth <= 900) return;
      event.preventDefault();
      const focusEl =
        field.dataset.filter === "year"
          ? field.querySelector("#yearFrom")
          : field.querySelector("select");
      setSidebarCollapsed(false);
      requestAnimationFrame(() => {
        focusEl?.focus();
      });
    });
  });

  markActiveFilterIcons();

  function setSidebarOpen(open) {
    if (!sidebar || !menuToggle) return;
    if (open) closeAllMultiSelects();
    sidebar.classList.toggle("is-open", open);
    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    menuToggle.setAttribute("aria-label", open ? "Close filters" : "Open filters");
    document.body.classList.toggle("nav-open", open);
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      setSidebarOpen(!sidebar.classList.contains("is-open"));
    });
  }
  if (backdrop) {
    backdrop.addEventListener("click", () => setSidebarOpen(false));
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.querySelector(".app-modal.is-open")) return;
      setSidebarOpen(false);
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setSidebarOpen(false);
    } else {
      closeAllMultiSelects();
    }
    requestAnimationFrame(() => {
      if (trendChart) trendChart.resize();
      if (volumeGrowthChart) volumeGrowthChart.resize();
      if (yieldTrendChart) yieldTrendChart.resize();
      if (ecosystemTrendChart) ecosystemTrendChart.resize();
    });
  });
}

async function boot() {
  bind();
  try {
    const health = await api("/api/health");
    renderStatus(health.refresh || {});
    const datasetHealth = health.datasets?.[DATASET];
    const dbReady = datasetHealth?.ready ?? health.db_exists;
    if (dbReady) {
      await loadMeta();
      await refreshDashboard();
    } else {
      renderStatus({ status: "running", message: "First-time PSA fetch…" });
      pollTimer = setInterval(pollRefreshStatus, 2500);
    }
  } catch (err) {
    renderStatus({ status: "error", message: err.message, last_error: err.message });
  }
}

boot();
