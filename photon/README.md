# Self-hosted place search (Photon)

The app searches places that aren't transit stops (malls, offices, streets,
"Billion Semenyih", "Publika") with [Photon](https://github.com/komoot/photon),
an OpenStreetMap geocoder. By default it uses the public server at
`photon.komoot.io`, which is shared and offered on a fair-use basis, with no
guaranteed capacity. Once real traffic arrives, run your own copy.

This folder builds a Photon instance holding **Malaysia and Singapore only**,
from the OpenStreetMap exports GraphHopper publishes for Photon 1.x.

## What it needs

| | |
| --- | --- |
| Disk | ~3 GB: downloads, the index, and room for one rebuild. Keep the disk **under 90% full**, because Photon's built-in OpenSearch stops writing at 95% and the import fails with "failed items in bulk". |
| Memory | ~1.5 GB (1 GB Java heap) |
| CPU | Any. The first import takes a few minutes. |
| Software | Docker with Compose, or Java 21 plus `zstd` and `curl` |

## Run it with Docker

On the server that runs the app:

```bash
cd photon
docker compose up -d --build
docker compose logs -f photon     # first start: download + import, then "started"
curl 'http://127.0.0.1:2322/api/?q=publika&limit=3'
```

Then point the app at it and restart the app:

```bash
PHOTON_URL=http://127.0.0.1:2322/api/
```

Photon listens on localhost only; the Node server is the only thing that
should talk to it.

## Run it without Docker

```bash
cd photon
curl -fsSLO https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar
DATA_DIR=/var/lib/photon PHOTON_JAR=./photon-1.3.0.jar ./build-index.sh
java -Xmx1g -jar photon-1.3.0.jar serve -data-dir /var/lib/photon/current \
  -listen-ip 127.0.0.1 -synonym-file ./synonyms.json -max-results 20
```

## Keep it fresh

The exports are regenerated about weekly. Rebuild once a month. The new index
is built next to the live one and swapped in only if the import succeeds, so a
failed rebuild leaves the old index serving.

```cron
# 04:00 on the 1st of each month
0 4 1 * * cd /path/to/Moovit/photon && docker compose exec -T photon ./build-index.sh && docker compose restart photon
```

While Photon restarts (about 10–20 s), the app uses the public server
automatically. It retries yours after a minute. Set `PHOTON_FALLBACK_URL=none`
to turn that off, or set it to another Photon instance.

## Files

- `build-index.sh`: downloads the Malaysia and Singapore exports, merges them,
  imports them, and swaps in the new index
- `synonyms.json`: Malaysian/Singaporean signage abbreviations (jln, tmn, kg,
  bkt …) and Malay place-type words (masjid, sekolah, klinik). These apply to
  queries of two or more words.
- `Dockerfile`, `entrypoint.sh`, `docker-compose.yml`: the container

## Attribution

Place data is © OpenStreetMap contributors, under the
[ODbL](https://www.openstreetmap.org/copyright). The app's footer and the
`/routes` pages credit it. Keep that credit visible wherever place results
appear.
