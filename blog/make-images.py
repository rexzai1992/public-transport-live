#!/usr/bin/env python3
"""Build map images for the guides by stitching CARTO voyager tiles
(self-hosted afterwards, credited in each figure's caption as the
OSM/CARTO licences require). Run once; outputs go to blog/img/."""
import math, io, urllib.request
from PIL import Image

def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def fetch(z, x, y):
    url = f"https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"
    req = urllib.request.Request(url, headers={"User-Agent": "pt-live-blog-builder/1.0"})
    return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read())).convert("RGB")

def build(name, lat, lon, z, cols=3, rows=2):
    cx, cy = tile_xy(lat, lon, z)
    x0, y0 = int(cx - cols / 2), int(cy - rows / 2)
    canvas = Image.new("RGB", (cols * 512, rows * 512))
    for i in range(cols):
        for j in range(rows):
            canvas.paste(fetch(z, x0 + i, y0 + j), (i * 512, j * 512))
    canvas = canvas.resize((cols * 341, rows * 341))  # ~1024px wide, crisp enough
    canvas.save(f"img/{name}.png", optimize=True)
    print(name, canvas.size)

build("klang-valley-rail", 3.12, 101.68, 11)
build("singapore-mrt", 1.33, 103.82, 11)
build("kl-city-buses", 3.145, 101.70, 13)
build("ktm-klang-valley", 3.05, 101.65, 10)
build("changi-airport", 1.345, 103.96, 12)
build("klia-area", 2.76, 101.70, 11)
