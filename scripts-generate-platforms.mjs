/* Builds a fill-in-the-blanks platform table.

   No feed publishes platform numbers and OSM does not link its platform refs to
   a line or direction, so the only trustworthy source is someone reading the
   sign. This generates every rail station in both directions, already labelled
   with the destination the platform is signed by, so filling it in is a matter
   of typing a number next to a name you can recognise.

   Interchanges come first: that is where a wrong platform costs a walk.

   Run: node scripts-generate-platforms.mjs > public/platform-overrides.js
*/
const BASE = process.env.API || "http://localhost:3000";

const RAIL_FEEDS = ["rapid-rail-kl", "ktmb"];
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

const stations = new Map(); // stopId -> { name, feed, lines:Set, dirs:Map }

for (const feed of RAIL_FEEDS) {
  const { routes } = await get(`/api/rapid-bus/${feed}/routes`);
  for (const route of routes) {
    const code = route.shortName || route.longName || route.routeId;
    for (const direction of [0, 1]) {
      let map;
      try {
        map = await get(`/api/rapid-bus/${feed}/map?routeId=${encodeURIComponent(route.routeId)}&direction=${direction}`);
      } catch {
        continue;
      }
      const pattern = map.patterns?.[map.direction];
      if (!pattern || map.direction !== direction) continue;

      const towards = (pattern.headsign || pattern.to || "")
        .replace(/^from\s+.*?\s+to\s+/i, "")
        .trim();

      for (const feature of map.geojson.features) {
        const p = feature.properties;
        if (p.kind !== "stop") continue;
        const key = `${feed}:${p.stopId}`;
        if (!stations.has(key)) {
          stations.set(key, { name: p.name, feed, lines: new Set(), dirs: new Map() });
        }
        const entry = stations.get(key);
        entry.lines.add(code);
        entry.dirs.set(`${route.routeId}|${direction}`, { code, routeId: route.routeId, direction, towards });
      }
    }
  }
}

// Interchanges: a station name served by more than one line.
const byName = new Map();
for (const [key, s] of stations) {
  const n = s.name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  byName.set(n, (byName.get(n) || 0) + 1);
}
const rows = [...stations.entries()].map(([key, s]) => {
  const n = s.name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return { key, ...s, interchange: byName.get(n) > 1 || s.lines.size > 1 };
});
rows.sort((a, b) => Number(b.interchange) - Number(a.interchange) || a.name.localeCompare(b.name));

const out = [];
out.push("/* Platform numbers, filled in by hand.");
out.push("");
out.push("   Nothing publishes these: no GTFS feed carries platform_code, and OSM's");
out.push("   platform refs are not linked to a line or direction. So each value below is");
out.push("   blank until someone confirms it on the platform sign.");
out.push("");
out.push("   Key is feed:stopId:routeId:directionId. Leave a value as \"\" and the app falls");
out.push("   the destination the platform is signed by, which is never wrong, just vaguer.");
out.push("");
out.push(`   Generated for ${rows.length} rail stations.`);
out.push("*/");
out.push("window.RAPIDBUS_PLATFORMS = {");
let section = null;
for (const row of rows) {
  const label = row.interchange ? "INTERCHANGE — wrong platform costs a walk" : "single-line stations";
  if (label !== section) {
    out.push(`\n  /* ===== ${label} ===== */`);
    section = label;
  }
  out.push(`  // ${row.name}  (${[...row.lines].join(", ")})`);
  for (const { code, routeId, direction, towards } of row.dirs.values()) {
    out.push(`  "${row.key}:${routeId}:${direction}": "", // ${code} towards ${towards || "?"}`);
  }
}
out.push("};");
console.log(out.join("\n"));
