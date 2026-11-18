// Regenerates src/pages/previewMap.js: the static East Africa map in the landing
// page's dashboard preview, drawn like the dashboard's DeviceMap.
// Run from the frontend folder: node scripts/gen-preview-map.mjs
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

// The frontend folder (this script lives in frontend/scripts), with a trailing slash.
const FRONTEND = fileURLToPath(new URL("..", import.meta.url)).replace(/\\/g, "/");
const require = createRequire(FRONTEND + "package.json");
const geo = await import(pathToFileURL(require.resolve("d3-geo")).href);
const topo = require("topojson-client");
const world = JSON.parse(readFileSync(FRONTEND + "node_modules/world-atlas/countries-110m.json", "utf8"));

const W = 260, H = 240, PAD = 0.25;
const VIEW = ["Uganda", "Rwanda", "Burundi", "Tanzania", "Kenya"];
const LABELS = { Uganda: "Uganda", Kenya: "Kenya", Tanzania: "Tanzania", Burundi: "Burundi", "Dem. Rep. Congo": "DR Congo" };
const PINS = ["Rwanda", "Kenya"];

const features = topo.feature(world, world.objects.countries).features;
const byName = Object.fromEntries(features.map((f) => [f.properties.name, f]));

const projection = geo.geoMercator().fitExtent(
  [[W * PAD, H * PAD], [W * (1 - PAD), H * (1 - PAD)]],
  { type: "FeatureCollection", features: VIEW.map((n) => byName[n]) },
);
// Draw a little past the frame so the SVG can be cropped to any card shape.
const M = 60;
projection.clipExtent([[-M, -M], [W + M, H + M]]);
const path = geo.geoPath(projection);
const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => (+n).toFixed(1));

const countries = [];
for (const f of features) {
  const d = path(f);
  if (!d) continue;
  const [[x0, y0], [x1, y1]] = path.bounds(f);
  if (x1 < -M || x0 > W + M || y1 < -M || y0 > H + M) continue;
  countries.push({ name: f.properties.name, d: round(d) });
}
const at = (n) => path.centroid(byName[n]).map((v) => +v.toFixed(1));
const labels = Object.entries(LABELS)
  .map(([n, text]) => ({ text, at: at(n) }))
  .filter(({ at: [x, y] }) => x > 8 && x < W - 8 && y > 8 && y < H - 8);
const pins = Object.fromEntries(PINS.map((n) => [n, at(n)]));

const out = `// Generated: a static East Africa map for the landing page's dashboard preview,
// drawn like the dashboard's DeviceMap (Mercator, world-atlas 2.0.2
// countries-110m) so the landing page doesn't load a map library or tiles.
// Coordinates are in a ${W} x ${H} viewBox, drawn ${M} units past each edge.

export const PREVIEW_MAP = ${JSON.stringify({ width: W, height: H, countries, labels, pins })};
`;
writeFileSync(FRONTEND + "src/pages/previewMap.js", out);
console.log(`${countries.length} countries, ${labels.length} labels, ${(out.length / 1024).toFixed(1)} KB`);
console.log("in view:", countries.map((c) => c.name).join(", "));
console.log("pins:", JSON.stringify(pins), "labels:", labels.map((l) => l.text).join(", "));
