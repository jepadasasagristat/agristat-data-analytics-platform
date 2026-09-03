window.AGRI_API_BASE = (function () {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "";
  return "https://agristat-data-analytics-platform.onrender.com";
})();

window.agriApiUrl = function agriApiUrl(path) {
  const base = String(window.AGRI_API_BASE || "").replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${suffix}` : suffix;
};
