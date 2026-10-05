/* Places that are not stops: malls, offices, schools, streets — "Billion
   Semenyih", "Publika", "IKEA Damansara". The transit feeds only know stop
   names, so these come from OpenStreetMap through Photon (photon.komoot.io),
   which unlike the public Nominatim server permits search-as-you-type.

   The journey planner already accepts any coordinate as a destination and
   walks from the nearest stops, so a place is just a named point.

   Answers are cached in memory: people retype the same few hundred places,
   and Photon is a shared community service whose goodwill we depend on. */

import { makeDoc, normalizeWords, scoreDoc } from "./search.js";

export type Place = {
  name: string;
  /** Street, area and city — enough to tell two "Billion"s apart. */
  detail: string;
  kind: string;
  lat: number;
  lon: number;
};

/* PHOTON_URL points at your own Photon (see photon/README.md); unset, the
   public komoot server is used. With a self-hosted primary, the public server
   stands in only while yours is down — a rebuild or a restart — so place
   search keeps working without leaning on community goodwill day to day.
   PHOTON_FALLBACK_URL=none switches the stand-in off. */
const PUBLIC_PHOTON = "https://photon.komoot.io/api/";
const PHOTON_URL = process.env.PHOTON_URL?.trim() || PUBLIC_PHOTON;
const FALLBACK_URL = (() => {
  const configured = process.env.PHOTON_FALLBACK_URL?.trim();
  if (configured === "none") return null;
  const url = configured || PUBLIC_PHOTON;
  return url === PHOTON_URL ? null : url;
})();
const TIMEOUT_MS = 4000;
/* After the primary fails, skip it for a minute instead of making every
   keystroke wait out its timeout. */
const PRIMARY_COOLDOWN_MS = 60_000;
let primaryDownUntil = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 2000;

/* lon/lat boxes. Malaysia includes Sabah and Sarawak. */
const REGION_BBOX = {
  my: "99.6,0.85,119.3,7.4",
  sg: "103.6,1.15,104.1,1.48"
} as const;

/* OSM types that are a place to go, not infrastructure. Bus stops are left to
   our own stop search, which knows which ones are actually served. */
const SKIP_VALUES = new Set([
  "bus_stop", "platform", "stop_position", "service", "footway", "path", "steps",
  "cycleway", "track", "crossing", "traffic_signals", "turning_circle", "taxi",
  "parking", "parking_space", "parking_entrance", "entrance", "gate", "bench", "waste_basket", "atm"
]);

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    osm_key?: string;
    osm_value?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    countrycode?: string;
  };
};

const cache = new Map<string, { at: number; places: Place[] }>();

function describe(p: PhotonFeature["properties"]): string {
  const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(" ") : undefined;
  const parts = [street, p.district ?? p.locality, p.city ?? p.county, p.state];
  const seen = new Set<string>();
  return parts
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key) || key === (p.name ?? "").toLowerCase()) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .join(", ");
}

async function photonQuery(base: string, params: URLSearchParams): Promise<PhotonFeature[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}?${params}`, {
      signal: controller.signal,
      headers: { "user-agent": "public-transport-live/1.0 (public.kaynx1.com)" }
    });
    if (!response.ok) throw new Error(`photon ${response.status}`);
    return ((await response.json()) as { features?: PhotonFeature[] }).features ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPlaces(
  query: string,
  region: "my" | "sg",
  near?: { lat: number; lon: number },
  limit = 5
): Promise<Place[]> {
  const words = normalizeWords(query);
  if (!words.length || query.trim().length < 3) return [];

  // Rounded so a nudge of the map reuses the answer.
  const bias = near ? `${near.lat.toFixed(1)},${near.lon.toFixed(1)}` : "";
  const cacheKey = `${region}|${words.join(" ")}|${bias}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.places.slice(0, limit);

  const params = new URLSearchParams({ q: query.trim(), limit: "12", bbox: REGION_BBOX[region] });
  if (near) {
    params.set("lat", near.lat.toFixed(3));
    params.set("lon", near.lon.toFixed(3));
  }

  let features: PhotonFeature[];
  if (FALLBACK_URL && Date.now() < primaryDownUntil) {
    features = await photonQuery(FALLBACK_URL, params);
  } else {
    try {
      features = await photonQuery(PHOTON_URL, params);
    } catch (error) {
      if (!FALLBACK_URL) throw error;
      primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
      console.warn(`photon at ${PHOTON_URL} failed, using fallback for a minute:`, error instanceof Error ? error.message : error);
      features = await photonQuery(FALLBACK_URL, params);
    }
  }

  const wantCountry = region === "sg" ? "SG" : "MY";
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const p = feature.properties;
    if (!p.name || (p.countrycode && p.countrycode.toUpperCase() !== wantCountry)) continue;
    if (p.osm_value && SKIP_VALUES.has(p.osm_value)) continue;
    const [lon, lat] = feature.geometry.coordinates;
    const detail = describe(p);
    // Photon returns a road once per OSM segment; one "Jalan Alor" is enough.
    const dedupe = `${p.name.toLowerCase()}|${(p.city ?? p.district ?? "").toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    places.push({ name: p.name, detail, kind: p.osm_value ?? p.osm_key ?? "place", lat, lon });
  }

  /* Photon is already relevance-ordered; names that contain every typed word
     go ahead of fuzzy guesses, keeping Photon's order among equals. */
  const scored = places.map((place, index) => ({
    place,
    index,
    good: scoreDoc(words, makeDoc(`${place.name} ${place.detail}`)) > 0
  }));
  scored.sort((a, b) => Number(b.good) - Number(a.good) || a.index - b.index);
  // Once anything really matches, Photon's loose guesses ("Public" for
  // "publika") are noise.
  const anyGood = scored.some((entry) => entry.good);
  const result = scored.filter((entry) => entry.good || !anyGood).map((entry) => entry.place);

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { at: Date.now(), places: result });
  return result.slice(0, limit);
}
