# Basemap for route maps

Route pages (`/route/...`) and the travel guide draw their maps over a
basemap of **OpenStreetMap** data that we host ourselves: a
[Protomaps](https://protomaps.com) PMTiles extract of Peninsular Malaysia,
Singapore and Kuching, served by the app at `/tiles/mysg.pmtiles`
(`data/tiles/` on the server, not in git). `public/routemap.js` reads it with
HTTP range requests through MapLibre.

Why self-hosted: the free tiers of hosted tile services (CARTO, MapTiler,
Stadia…) are for non-commercial use, and the site carries ads. OpenStreetMap
data is ODbL — free for any use with the credit "© OpenStreetMap
contributors", which every map shows.

## Rebuild (monthly is plenty)

On the server:

```bash
cd /opt/pmtiles          # pmtiles CLI from github.com/protomaps/go-pmtiles
BUILD=$(date -u -d yesterday +%Y%m%d)   # daily planet builds: build.protomaps.com
./pmtiles extract https://build.protomaps.com/$BUILD.pmtiles \
  /opt/rapidbus/data/tiles/mysg.next.pmtiles \
  --region=/opt/rapidbus/docs/basemap-region.geojson
mv /opt/rapidbus/data/tiles/mysg.next.pmtiles /opt/rapidbus/data/tiles/mysg.pmtiles
```

About 300 MB, a few seconds to fetch. To cover another area, add a polygon
to `basemap-region.geojson`.
