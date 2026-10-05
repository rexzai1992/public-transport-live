/* Route maps on a real street map, for the route pages (/route/...) and the
   travel guide.

   The page renders an SVG drawing of the route first (no JavaScript needed,
   nothing to load). When that figure scrolls into view, this script loads
   MapLibre and draws the same route over a basemap of OpenStreetMap data that
   we host ourselves (a Protomaps extract of Malaysia + Singapore served from
   public.kaynx1.com/tiles), then fades the SVG out. No third-party tile
   service is involved, so there is no tile licence to break — only the
   OpenStreetMap credit, which the map shows.

   Markup (route pages use a <figure>, the guide a <div>):
   <figure class="rmap livemap" data-map='{"lines":[{"c":"#e57200",
   "p":[[lon,lat],...]}],"stops":[{"p":[lon,lat],"k":"e|x|","n":"Name",
   "i":"KJL","l":1}]}'> ... SVG fallback ... </figure>
     k: "e" an end, "x" an interchange; l: 1 to label it. */
(() => {
  const figures = [...document.querySelectorAll(".livemap[data-map]")];
  if (!figures.length || !("IntersectionObserver" in window)) return;

  const TILES = "https://public.kaynx1.com/tiles/mysg.pmtiles";
  const LIBS = [
    "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js",
    "https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js",
    "https://cdn.jsdelivr.net/npm/@protomaps/basemaps@5.7.2/dist/basemaps.js"
  ];
  const CSS = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css";

  let ready = null;
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  function loadLibs() {
    if (ready) return ready;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS;
    document.head.appendChild(link);
    ready = Promise.all(LIBS.map(loadScript)).then(() => {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
    });
    return ready;
  }

  const dark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

  function style() {
    const flavor = dark() ? "black" : "grayscale";
    return {
      version: 8,
      glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
      sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${dark() ? "dark" : "light"}`,
      sources: {
        protomaps: {
          type: "vector",
          url: `pmtiles://${TILES}`,
          attribution: '<a href="https://protomaps.com" rel="noopener">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>'
        }
      },
      layers: basemaps.layers("protomaps", basemaps.namedFlavor(flavor), { lang: "en" })
    };
  }

  function draw(figure) {
    let data;
    try {
      data = JSON.parse(figure.dataset.map);
    } catch {
      return;
    }
    const holder = document.createElement("div");
    holder.className = "ml-map";
    figure.appendChild(holder);

    const bounds = new maplibregl.LngLatBounds();
    for (const line of data.lines) for (const p of line.p) bounds.extend(p);
    for (const stop of data.stops) bounds.extend(stop.p);

    const map = new maplibregl.Map({
      container: holder,
      style: style(),
      bounds,
      fitBoundsOptions: { padding: 44 },
      maxZoom: 17,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: true,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      const ink = dark() ? "#080808" : "#ffffff";
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: data.lines.map((line) => ({
            type: "Feature",
            // Buses have no line colour of their own: ink, flipped for dark maps.
            properties: { c: line.c || (dark() ? "#f2f2f2" : "#111111") },
            geometry: { type: "LineString", coordinates: line.p }
          }))
        }
      });
      map.addSource("stops", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: data.stops.map((stop) => ({
            type: "Feature",
            properties: { k: stop.k || "", c: stop.c || data.lines[0]?.c || (dark() ? "#f2f2f2" : "#111111") },
            geometry: { type: "Point", coordinates: stop.p }
          }))
        }
      });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ink, "line-width": 9 } });
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 5 } });
      map.addLayer({
        id: "route-stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["match", ["get", "k"], "e", 7, "x", 5.5, 3.5],
          "circle-color": ["match", ["get", "k"], "e", ["get", "c"], ink],
          "circle-stroke-color": ["match", ["get", "k"], "e", ink, "x", dark() ? "#ffffff" : "#0a0a0a", ["get", "c"]],
          "circle-stroke-width": ["match", ["get", "k"], "e", 2.5, "x", 2.5, 2]
        }
      });
      const width = holder.clientWidth;
      for (const stop of data.stops.filter((s) => s.l)) {
        // Open the label towards the middle so it isn't cut off at the edge.
        const right = map.project(stop.p).x > width * 0.6;
        const el = document.createElement("div");
        el.className = `ml-lbl${stop.k === "e" ? " end" : ""}`;
        el.textContent = stop.n;
        if (stop.i) {
          const i = document.createElement("i");
          i.textContent = stop.i;
          el.appendChild(i);
        }
        new maplibregl.Marker({ element: el, anchor: right ? "right" : "left", offset: [right ? -10 : 10, 0] }).setLngLat(stop.p).addTo(map);
      }
      figure.classList.add("live");
    });
  }

  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        watch.unobserve(entry.target);
        loadLibs().then(() => draw(entry.target)).catch(() => {
          /* the SVG drawing stays — still a map, just without streets */
        });
      }
    },
    { rootMargin: "200px" }
  );
  figures.forEach((figure) => watch.observe(figure));
})();
