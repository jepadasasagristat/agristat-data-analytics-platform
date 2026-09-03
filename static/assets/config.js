window.AGRI_API_BASE = "";

window.agriApiUrl = function agriApiUrl(path) {
  const base = String(window.AGRI_API_BASE || "").replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${suffix}` : suffix;
};
