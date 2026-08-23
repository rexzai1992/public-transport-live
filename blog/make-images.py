#!/usr/bin/env python3
"""Guide maps with the actual lines drawn point-to-point: basemap tiles from
CARTO (credited), route geometry fetched from the live tracker's API — the
same GTFS shapes the app draws. Outputs WebP to img/."""
import math, io, json, urllib.request, urllib.parse
from PIL import Image, ImageDraw

APP = "https://public.kaynx1.com"

def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def http(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pt-live-blog-builder/1.0"})
    return urllib.request.urlopen(req, timeout=30).read()

def fetch_tile(z, x, y):
    return Image.open(io.BytesIO(http(f"https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"))).convert("RGB")

_routes_cache = {}
def resolve(cat, code):
    if cat not in _routes_cache:
        _routes_cache[cat] = json.loads(http(f"{APP}/api/rapid-bus/{cat}/routes"))["routes"]
    for r in _routes_cache[cat]:
        if code in (r.get("shortName"), r.get("routeId")) or code in (r.get("longName") or ""):
            return r
    raise SystemExit(f"route not found: {cat}:{code}")

FALLBACK = {"KGL":"#1b8a3e","PYL":"#f9a825","KJL":"#d32f2f","AGL":"#ef6c00","SPL":"#6d4c41",
            "SAL":"#8e24aa","MRL":"#2e7d32","BRT":"#00838f","NSL":"#d42e12","EWL":"#009645",
            "CGL":"#009645","NEL":"#9900aa","CCL":"#fa9e0d","DTL":"#005ec4","TEL":"#9d5b25"}

def build(name, lat, lon, z, lines, cols=3, rows=2):
    cx, cy = tile_xy(lat, lon, z)
    x0, y0 = int(cx - cols / 2), int(cy - rows / 2)
    canvas = Image.new("RGB", (cols * 512, rows * 512))
    for i in range(cols):
        for j in range(rows):
            canvas.paste(fetch_tile(z, x0 + i, y0 + j), (i * 512, j * 512))
    draw = ImageDraw.Draw(canvas)

    def px(lat_, lon_):
        tx, ty = tile_xy(lat_, lon_, z)
        return ((tx - x0) * 512, (ty - y0) * 512)

    resolved = []
    for cat, code, color in lines:
        route = resolve(cat, code)
        rid = urllib.parse.quote(route["routeId"])
        data = json.loads(http(f"{APP}/api/rapid-bus/{cat}/map?routeId={rid}"))
        col = color or ("#" + route["color"] if route.get("color") else FALLBACK.get(code, "#2563eb"))
        shapes = [f["geometry"]["coordinates"] for f in data["geojson"]["features"]
                  if f["properties"].get("kind") == "route-shape"]
        resolved.append((col, [[px(la, lo) for lo, la in shape] for shape in shapes]))

    # casing pass first so overlapping lines stay readable, then colour pass
    for _, shape_sets in resolved:
        for pts in shape_sets:
            if len(pts) > 1: draw.line(pts, fill="#ffffff", width=11, joint="curve")
    for col, shape_sets in resolved:
        for pts in shape_sets:
            if len(pts) > 1: draw.line(pts, fill=col, width=6, joint="curve")
        for pts in shape_sets:  # terminus dots
            if len(pts) > 1:
                for tx, ty in (pts[0], pts[-1]):
                    draw.ellipse([tx-7, ty-7, tx+7, ty+7], fill="#ffffff", outline=col, width=4)

    canvas = canvas.resize((cols * 341, rows * 341))
    canvas.save(f"img/{name}.webp", "WEBP", quality=82, method=6)
    print(name, "with", len(lines), "lines")

RAIL = "rapid-rail-kl"
build("klang-valley-rail", 3.12, 101.66, 11,
      [(RAIL, c, None) for c in ["KGL","PYL","KJL","AGL","SPL","SAL","MRL","BRT"]])
build("singapore-mrt", 1.33, 103.82, 11,
      [("sg-rail", c, None) for c in ["NSL","EWL","CGL","NEL","CCL","DTL","TEL"]])
build("kl-city-buses", 3.145, 101.70, 13,
      [("rapid-bus-kl","300","#2563eb"),("rapid-bus-kl","303","#16a34a"),("rapid-bus-kl","400","#d97706")])
build("ktm-klang-valley", 3.05, 101.65, 10,
      [("ktmb","Seremban Line",None),("ktmb","Port Klang Line","#2563eb")])
build("changi-airport", 1.345, 103.96, 12,
      [("sg-rail","CGL",None),("sg-bus","36","#2563eb")])
build("klia-area", 2.76, 101.70, 11, [])
# Wide banner for the landing hero: the whole KL rail network in one strip.
build("hero-banner", 3.11, 101.66, 11,
      [(RAIL, c, None) for c in ["KGL","PYL","KJL","AGL","SPL","SAL","MRL","BRT"]],
      cols=4, rows=2)
