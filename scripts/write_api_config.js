const fs = require("fs");
const path = require("path");

const origin = String(process.env.API_ORIGIN || "").trim().replace(/\/$/, "");
const out = path.join(__dirname, "..", "static", "assets", "config.js");

const contents = `window.AGRI_API_BASE = ${JSON.stringify(origin)};

window.agriApiUrl = function agriApiUrl(path) {
  const base = String(window.AGRI_API_BASE || "").replace(/\\/$/, "");
  const suffix = path.startsWith("/") ? path : \`/\${path}\`;
  return base ? \`\${base}\${suffix}\` : suffix;
};
`;

fs.writeFileSync(out, contents);
console.log(`Wrote static/assets/config.js with API_ORIGIN=${origin || "(same origin)"}`);
