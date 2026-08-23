#!/usr/bin/env python3
"""Guide maps, fitted to their content: fetch the route geometry first, frame
the map around ITS bounding box (centered, padded), then draw lines, stops and
labels. Basemap tiles © CARTO/OSM (credited in captions); geometry from the
live tracker's own GTFS API."""
import math, io, json, urllib.request, urllib.parse
from PIL import Image, ImageDraw, ImageFont

APP = "https://public.kaynx1.com"
UA = {"User-Agent": "pt-live-blog-builder/1.0"}
try:
    FONT = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
except Exception:
    FONT = ImageFont.load_default()

def http(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()

def merc(lat, lon, z):
    n = 2 ** z * 512  # global pixels at @2x
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y

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

def build(name, lines, W=1536, H=1024, bbox=None, labels=True, pad=0.10):
    # 1. geometry first
    resolved, stops_all = [], []
    lats, lons = [], []
    for cat, code, color in lines:
        route = resolve(cat, code)
        rid = urllib.parse.quote(route["routeId"])
        data = json.loads(http(f"{APP}/api/rapid-bus/{cat}/map?routeId={rid}"))
        col = color or ("#" + route["color"] if route.get("color") else FALLBACK.get(code, "#2563eb"))
        feats = data["geojson"]["features"]
        shapes = [f["geometry"]["coordinates"] for f in feats if f["properties"].get("kind") == "route-shape"]
        resolved.append((col, shapes))
        for shape in shapes:
            for lo, la in shape:
                lats.append(la); lons.append(lo)
        for f in feats:
            if f["properties"].get("kind") == "stop":
                lo, la = f["geometry"]["coordinates"]
                nm = str(f["properties"].get("name", "")).split("(")[0].strip()
                stops_all.append((la, lo, nm, col))
    if bbox:
        lats += [bbox[0], bbox[2]]; lons += [bbox[1], bbox[3]]
    if not lats:
        raise SystemExit(f"{name}: nothing to frame")

    # 2. frame: zoom that fits the padded bbox inside W×H, content centred
    la0, la1, lo0, lo1 = min(lats), max(lats), min(lons), max(lons)
    clat, clon = (la0 + la1) / 2, (lo0 + lo1) / 2
    z = 14.0
    while z > 8:
        x0, y0 = merc(la1, lo0, z); x1, y1 = merc(la0, lo1, z)
        if (x1 - x0) <= W * (1 - pad * 2) and (y1 - y0) <= H * (1 - pad * 2):
            break
        z -= 0.25
    zi = int(z)  # tiles exist at integer zooms; scale the difference
    scale = 2 ** (z - zi)
    cx, cy = merc(clat, clon, zi)
    gx0, gy0 = cx - (W / scale) / 2, cy - (H / scale) / 2  # crop origin, zi pixels

    tx0, ty0 = int(gx0 // 512), int(gy0 // 512)
    tx1, ty1 = int((gx0 + W / scale) // 512) + 1, int((gy0 + H / scale) // 512) + 1
    base = Image.new("RGB", ((tx1 - tx0 + 1) * 512, (ty1 - ty0 + 1) * 512), "#eef2f5")
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            try:
                tile = Image.open(io.BytesIO(http(
                    f"https://a.basemaps.cartocdn.com/rastertiles/voyager/{zi}/{tx}/{ty}@2x.png"))).convert("RGB")
                base.paste(tile, ((tx - tx0) * 512, (ty - ty0) * 512))
            except Exception:
                pass
    canvas = base.crop((int(gx0 - tx0 * 512), int(gy0 - ty0 * 512),
                        int(gx0 - tx0 * 512 + W / scale), int(gy0 - ty0 * 512 + H / scale)))
    if scale != 1:
        canvas = canvas.resize((W, H), Image.LANCZOS)
    draw = ImageDraw.Draw(canvas)

    def px(la, lo):
        x, y = merc(la, lo, zi)
        return ((x - gx0) * scale, (y - gy0) * scale)

    # 3. lines: casing pass then colour pass
    pts_sets = [(col, [[px(la, lo) for lo, la in shape] for shape in shapes]) for col, shapes in resolved]
    for _, shape_sets in pts_sets:
        for pts in shape_sets:
            if len(pts) > 1: draw.line(pts, fill="#ffffff", width=11, joint="curve")
    for col, shape_sets in pts_sets:
        for pts in shape_sets:
            if len(pts) > 1: draw.line(pts, fill=col, width=6, joint="curve")

    # 4. stops + collision-avoided labels
    if labels and stops_all:
        seen, boxes = set(), []
        for la, lo, nm, col in stops_all:
            sx, sy = px(la, lo)
            keypt = (round(sx / 6), round(sy / 6))
            if keypt in seen or not (0 <= sx <= W and 0 <= sy <= H):
                continue
            seen.add(keypt)
            draw.ellipse([sx - 4.5, sy - 4.5, sx + 4.5, sy + 4.5], fill="#ffffff", outline=col, width=3)
            if not nm:
                continue
            tw = draw.textlength(nm, font=FONT)
            box = (sx + 8, sy - 9, sx + 8 + tw + 4, sy + 9)
            if any(not (box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3]) for b in boxes):
                continue
            boxes.append(box)
            draw.text((sx + 10, sy - 8), nm, font=FONT, fill="#1a2330", stroke_width=3, stroke_fill="#ffffff")

    out = canvas.resize((W * 2 // 3, H * 2 // 3), Image.LANCZOS)
    out.save(f"img/{name}.webp", "WEBP", quality=82, method=6)
    print(name, f"z={z:.2f}", out.size, f"{len(lines)} lines / {len(stops_all)} stops")

RAIL = "rapid-rail-kl"
KL_LINES = [(RAIL, c, None) for c in ["KGL","PYL","KJL","AGL","SPL","SAL","MRL","BRT"]]
SG_LINES = [("sg-rail", c, None) for c in ["NSL","EWL","CGL","NEL","CCL","DTL","TEL"]]

build("hero-banner", KL_LINES, W=2560, H=1024)
build("klang-valley-rail", KL_LINES)
build("singapore-mrt", SG_LINES)
build("kl-city-buses", [("rapid-bus-kl","300","#2563eb"),("rapid-bus-kl","303","#16a34a"),("rapid-bus-kl","400","#d97706")])
build("ktm-klang-valley", [("ktmb","Seremban Line",None),("ktmb","Port Klang Line","#2563eb")])
build("changi-airport", [("sg-rail","CGL",None),("sg-bus","36","#2563eb")])
build("klia-area", [("rapid-bus-kl","300","#00000000")], bbox=(2.70,101.62,2.85,101.78), labels=False, pad=0.0) if False else None
