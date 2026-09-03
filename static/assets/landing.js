const PIN_STORAGE_KEY = "agristat-pinned-dashboards";

const SNAPSHOT_META = {
  palay: {
    href: "/dashboards/palay",
    short: "Palay",
    color: "#09663f",
    breakdownColors: ["#09663f", "#7fa86a"],
  },
  corn: {
    href: "/dashboards/corn",
    short: "Corn",
    color: "#c9a227",
    breakdownColors: ["#b8890a", "#dcc06a"],
  },
  fruits: {
    href: "/dashboards/fruits",
    short: "Fruits",
    color: "#d4622a",
    leaderColors: ["#d4622a", "#e2ebe4"],
  },
  vegetables: {
    href: "/dashboards/vegetables",
    short: "Vegetables",
    color: "#3d8b40",
    leaderColors: ["#2f7a33", "#e2ebe4"],
  },
};

const STAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';

let latestSnapshotData = null;

function readPinnedIds() {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writePinnedIds(ids) {
  localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
}

function togglePinned(id) {
  const pinned = readPinnedIds();
  const next = pinned.includes(id) ? pinned.filter((item) => item !== id) : [...pinned, id];
  writePinnedIds(next);
  return next;
}

function formatMt(value, { compact = true } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  if (!compact) return num.toLocaleString("en-PH", { maximumFractionDigits: 0 });
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(1)}%`;
}

function growthClass(value) {
  if (value == null || Number.isNaN(Number(value)) || Math.abs(value) < 0.05) return "is-flat";
  return value > 0 ? "is-up" : "is-down";
}

function growthArrow(value) {
  const tone = growthClass(value);
  if (tone === "is-up") return "▲";
  if (tone === "is-down") return "▼";
  return "•";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSharePct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value))}%`;
}

function renderShareBar(items, colors) {
  if (!items?.length) return "";

  const barLabel = items
    .map((item) => `${item.label} ${formatSharePct(item.share_pct)}`)
    .join(", ");

  const segments = items
    .map((item, index) => {
      const width = Math.max(0, Math.min(100, Number(item.share_pct)));
      const color = colors[index] || colors[0];
      return `<span class="landing-breakdown-seg" style="width:${width}%;background-color:${color}" title="${escapeHtml(item.label)} ${formatSharePct(item.share_pct)}"></span>`;
    })
    .join("");

  const legend = items
    .map((item, index) => {
      const color = colors[index] || colors[0];
      return `<span class="landing-breakdown-legend-item"><span class="landing-breakdown-swatch" style="background-color:${color}"></span>${escapeHtml(item.label)} ${formatSharePct(item.share_pct)}</span>`;
    })
    .join("");

  return `<div class="landing-snapshot-breakdown-bar" role="img" aria-label="${escapeHtml(barLabel)}">${segments}</div>
    <div class="landing-snapshot-breakdown-legend">${legend}</div>`;
}

function renderSnapshotBreakdown(snapshot) {
  const breakdown = snapshot.breakdown;
  if (!breakdown?.items?.length) return "";

  const items = breakdown.items.filter((item) => item.share_pct != null);
  if (items.length < 2) return "";

  const colors = SNAPSHOT_META[snapshot.id]?.breakdownColors || ["#06402b", "#7fa86a"];
  const title = escapeHtml(breakdown.title || "Distribution");
  const bar = renderShareBar(items, colors);

  return `<div class="landing-snapshot-breakdown">
    <span class="landing-snapshot-breakdown-title">${title}</span>
    ${bar}
  </div>`;
}

function renderTopCropLeader(snapshot) {
  const top = snapshot.top_crop;
  if (!top?.crop_group) return "";

  const cropName = escapeHtml(top.crop_group);
  const title =
    '<span class="landing-snapshot-breakdown-title">Crop with Highest Average Production :</span>';
  const head = `<div class="landing-snapshot-leader-head">${title}<strong class="landing-snapshot-leader-crop">${cropName}</strong></div>`;

  if (top.share_pct == null || Number.isNaN(Number(top.share_pct))) {
    return `<div class="landing-snapshot-breakdown">${head}</div>`;
  }

  const topShare = Number(top.share_pct);
  const otherShare = Math.max(0, 100 - topShare);
  const colors = SNAPSHOT_META[snapshot.id]?.leaderColors || [
    SNAPSHOT_META[snapshot.id]?.color || "#06402b",
    "#e2ebe4",
  ];
  const items = [
    { label: top.crop_group, share_pct: topShare },
    { label: "Other crops", share_pct: otherShare },
  ];
  const bar = renderShareBar(items, colors);

  return `<div class="landing-snapshot-breakdown">
    ${head}
    ${bar}
  </div>`;
}

function renderSnapshotCard(snapshot) {
  const meta = SNAPSHOT_META[snapshot.id] || {};
  const href = meta.href || "#";
  const growth = snapshot.comparison?.growth_rate_pct;
  const growthTone = growthClass(growth);
  const compareFrom = snapshot.comparison?.year_from;
  const compareTo = snapshot.comparison?.year_to;
  const accentClass = snapshot.id ? ` landing-snapshot--${snapshot.id}` : "";
  const hasSeries = Array.isArray(snapshot.series) && snapshot.series.length >= 2;

  if (!snapshot.ready) {
    return `<a class="landing-snapshot landing-snapshot-unavailable${accentClass}" href="${href}">
      <div class="landing-snapshot-top">
        <span class="landing-snapshot-name">${escapeHtml(meta.short || snapshot.label)}</span>
      </div>
      <div class="landing-snapshot-metric">
        <strong class="landing-snapshot-value">—</strong>
        <span class="landing-snapshot-unit">MT avg</span>
      </div>
      <span class="landing-snapshot-meta">Data not available yet</span>
    </a>`;
  }

  const period =
    snapshot.year_count === 1
      ? `${snapshot.year_from}`
      : `${snapshot.year_from}–${snapshot.year_to}`;
  const leader = renderTopCropLeader(snapshot);
  const chartBlock = hasSeries
    ? `<div class="landing-snapshot-chart-wrap">
        <canvas class="landing-sparkline" data-snapshot-id="${escapeHtml(snapshot.id)}" role="img" aria-label="Annual production volume trend"></canvas>
        <p class="landing-sparkline-tip" data-tip-for="${escapeHtml(snapshot.id)}" aria-live="polite"></p>
      </div>`
    : "";

  const breakdownBlock = renderSnapshotBreakdown(snapshot);

  return `<a class="landing-snapshot${accentClass}" href="${href}" data-snapshot-id="${escapeHtml(snapshot.id)}">
    <div class="landing-snapshot-top">
      <span class="landing-snapshot-name">${escapeHtml(meta.short || snapshot.label)}</span>
      <span class="landing-snapshot-period">${period}</span>
    </div>
    <div class="landing-snapshot-metric">
      <strong class="landing-snapshot-value">${formatMt(snapshot.volume_mt_avg)}</strong>
      <span class="landing-snapshot-unit">MT avg</span>
    </div>
    ${chartBlock}
    <div class="landing-snapshot-foot">
      <div class="landing-snapshot-foot-row">
        <span class="landing-snapshot-change ${growthTone}">
          <span class="landing-snapshot-change-arrow" aria-hidden="true">${growthArrow(growth)}</span>
          ${formatPct(growth)} YoY
        </span>
        <span class="landing-snapshot-growth-meta">${compareFrom}→${compareTo}</span>
      </div>
      ${breakdownBlock}
      ${leader}
    </div>
  </a>`;
}

function drawSparkline(canvas, series, color) {
  const points = (series || []).filter((p) => p.volume_mt != null);
  if (!canvas || points.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 240;
  const height = canvas.clientHeight || 72;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const values = points.map((p) => Number(p.volume_mt));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 4;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * innerW;
    const y = padY + innerH - ((Number(p.volume_mt) - min) / range) * innerH;
    return { x, y, year: p.year, volume_mt: p.volume_mt };
  });

  const baselineY = height - padY;
  const gradient = ctx.createLinearGradient(0, padY, 0, baselineY);
  gradient.addColorStop(0, `${color}40`);
  gradient.addColorStop(1, `${color}05`);

  ctx.beginPath();
  coords.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.lineTo(coords[coords.length - 1].x, baselineY);
  ctx.lineTo(coords[0].x, baselineY);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = "#e2ebe4";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, height - padY);
  ctx.lineTo(width - padX, height - padY);
  ctx.stroke();

  ctx.beginPath();
  coords.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const last = coords[coords.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  canvas._sparkCoords = coords;
  canvas._sparkColor = color;
}

function bindSparklineInteraction(canvas) {
  const tip = document.querySelector(`[data-tip-for="${canvas.dataset.snapshotId}"]`);
  if (!tip) return;

  const showTip = (pt) => {
    if (!tip || !pt) {
      if (tip) tip.textContent = "";
      return;
    }
    tip.textContent = `${pt.year}: ${formatMt(pt.volume_mt, { compact: false })} MT`;
  };

  const nearest = (clientX) => {
    const coords = canvas._sparkCoords || [];
    if (!coords.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = coords[0];
    let bestDist = Math.abs(coords[0].x - x);
    for (const pt of coords) {
      const dist = Math.abs(pt.x - x);
      if (dist < bestDist) {
        best = pt;
        bestDist = dist;
      }
    }
    return best;
  };

  canvas.addEventListener("mousemove", (event) => {
    showTip(nearest(event.clientX));
  });
  canvas.addEventListener("mouseleave", () => showTip(null));
}

function renderSparklines(data) {
  const snapshots = data?.snapshots || [];
  for (const snapshot of snapshots) {
    if (!snapshot.ready || !snapshot.series?.length) continue;
    const meta = SNAPSHOT_META[snapshot.id] || {};
    const canvas = document.querySelector(
      `.landing-sparkline[data-snapshot-id="${CSS.escape(snapshot.id)}"]`
    );
    if (!canvas) continue;
    drawSparkline(canvas, snapshot.series, meta.color || "#09663f");
    bindSparklineInteraction(canvas);
  }
}

function updateSnapshotsSubtitle(data) {
  const sub = document.getElementById("snapshotsSub");
  if (!sub) return;

  const yearThrough = data?.year_through;
  const ready = data?.ready_count ?? 0;

  if (!ready) {
    sub.textContent = "Production data is not available yet.";
    return;
  }

  const coverage = yearThrough
    ? `through ${yearThrough}`
    : `across ${ready} commodit${ready === 1 ? "y" : "ies"}`;

  sub.textContent = `National five-year production averages ${coverage}. Hover a chart for year-by-year volume.`;
}

function renderSnapshots(data) {
  const grid = document.getElementById("snapshotGrid");
  if (!grid) return;
  latestSnapshotData = data;
  const snapshots = data?.snapshots || [];
  grid.innerHTML = snapshots.map(renderSnapshotCard).join("");
  grid.setAttribute("aria-busy", "false");
  grid.classList.add("is-loaded");
  updateSnapshotsSubtitle(data);
  requestAnimationFrame(() => renderSparklines(data));
}

function renderSnapshotSkeletons() {
  const grid = document.getElementById("snapshotGrid");
  if (!grid) return;
  grid.classList.remove("is-loaded");
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = Array.from({ length: 4 })
    .map(
      () => `<div class="landing-snapshot landing-snapshot-skeleton" aria-hidden="true">
      <span class="landing-skeleton-line landing-skeleton-line-sm"></span>
      <span class="landing-skeleton-line landing-skeleton-line-lg"></span>
      <span class="landing-skeleton-line landing-skeleton-line-chart"></span>
      <span class="landing-skeleton-line landing-skeleton-line-md"></span>
    </div>`
    )
    .join("");
}

function sortCatalogCards() {
  const pinned = readPinnedIds();
  document.querySelectorAll(".landing-card-grid").forEach((grid) => {
    const wraps = [...grid.querySelectorAll(".landing-card-wrap")];
    wraps.sort((a, b) => {
      const aId = a.dataset.dashboardId || "";
      const bId = b.dataset.dashboardId || "";
      const aPinned = pinned.includes(aId);
      const bPinned = pinned.includes(bId);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return (Number(a.dataset.order) || 0) - (Number(b.dataset.order) || 0);
    });
    wraps.forEach((wrap) => {
      grid.appendChild(wrap);
      wrap.classList.toggle("is-pinned", pinned.includes(wrap.dataset.dashboardId || ""));
    });
  });
}

function syncPinButtons() {
  const pinned = readPinnedIds();
  document.querySelectorAll(".landing-pin-btn").forEach((btn) => {
    const id = btn.dataset.pinId;
    const pressed = pinned.includes(id);
    btn.classList.toggle("is-pinned", pressed);
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    btn.setAttribute("aria-label", pressed ? "Remove from favorites" : "Add to favorites");
    btn.title = pressed ? "Favorited" : "Add to favorites";
  });
}

function bindPinButtons() {
  document.querySelectorAll(".landing-pin-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.pinId;
      if (!id) return;
      togglePinned(id);
      syncPinButtons();
      sortCatalogCards();
    });
  });
}

function setRefreshBusy(busy) {
  const btn = document.getElementById("snapshotRefreshBtn");
  if (!btn) return;
  btn.disabled = busy;
  btn.classList.toggle("is-busy", busy);
  btn.setAttribute("aria-label", busy ? "Refreshing snapshot data" : "Refresh snapshot data");
}

async function loadLandingSummary() {
  renderSnapshotSkeletons();
  setRefreshBusy(true);
  try {
    const res = await fetch(window.agriApiUrl("/api/landing/summary"), { cache: "no-store" });
    if (!res.ok) throw new Error(`Summary request failed (${res.status})`);
    const data = await res.json();
    renderSnapshots(data);
  } catch (err) {
    console.error("Landing summary failed:", err);
    const sub = document.getElementById("snapshotsSub");
    if (sub) sub.textContent = "Start the AgriStat server to load live production data.";
    const grid = document.getElementById("snapshotGrid");
    if (grid) {
      grid.setAttribute("aria-busy", "false");
      grid.innerHTML =
        '<p class="landing-snapshot-error">Production snapshot requires the backend API. Dashboard links below still work.</p>';
    }
  } finally {
    setRefreshBusy(false);
  }
}

function bindSnapshotRefresh() {
  const btn = document.getElementById("snapshotRefreshBtn");
  btn?.addEventListener("click", () => loadLandingSummary());
}

function bindSparklineResize() {
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (latestSnapshotData) renderSparklines(latestSnapshotData);
    }, 150);
  });
}

const PH_TIMEZONE = "Asia/Manila";
let landingClockTimer = null;

function phDateTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    weekday: "long",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return parts;
}

function buildPhIso(parts) {
  let h = Number(parts.hour);
  const isPm = parts.dayPeriod?.toUpperCase() === "PM";
  if (isPm && h !== 12) h += 12;
  if (!isPm && h === 12) h = 0;
  const pad = (n) => String(n).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${pad(h)}:${parts.minute}:${parts.second}+08:00`;
}

function formatPhDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function updateLandingClock() {
  const now = new Date();
  const timeEl = document.getElementById("landingClockTime");
  const dateEl = document.getElementById("landingClockDate");
  const hmEl = document.getElementById("landingClockHm");
  const secEl = document.getElementById("landingClockSec");
  const ampmEl = document.getElementById("landingClockAmpm");
  if (!timeEl || !dateEl || !hmEl || !secEl || !ampmEl) return;

  const parts = phDateTimeParts(now);
  hmEl.textContent = `${parts.hour}:${parts.minute}`;
  secEl.textContent = parts.second;
  ampmEl.textContent = parts.dayPeriod;
  timeEl.dateTime = buildPhIso(parts);
  dateEl.textContent = formatPhDate(now);
  dateEl.dateTime = `${parts.year}-${parts.month}-${parts.day}`;
}

function initLandingClock() {
  updateLandingClock();
  if (landingClockTimer) clearInterval(landingClockTimer);
  landingClockTimer = setInterval(updateLandingClock, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (landingClockTimer) {
        clearInterval(landingClockTimer);
        landingClockTimer = null;
      }
    } else {
      updateLandingClock();
      if (!landingClockTimer) landingClockTimer = setInterval(updateLandingClock, 1000);
    }
  });
}

function initLanding() {
  document.querySelectorAll(".landing-pin-btn").forEach((btn) => {
    if (!btn.querySelector("svg")) btn.innerHTML = STAR_ICON;
  });
  syncPinButtons();
  sortCatalogCards();
  bindPinButtons();
  bindSnapshotRefresh();
  bindSparklineResize();
  initLandingClock();
  loadLandingSummary();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLanding);
} else {
  initLanding();
}
