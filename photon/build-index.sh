#!/usr/bin/env bash
# Build (or rebuild) the Photon place-search index for Malaysia + Singapore.
#
# Downloads the OpenStreetMap exports GraphHopper prepares for Photon 1.x,
# joins the two countries into one dump, and imports it into DATA_DIR.
# Photon import always starts from scratch, so the new index is built beside
# the live one and swapped in only once it is complete: a failed refresh
# leaves yesterday's index serving.
#
#   DATA_DIR      where the index lives          (default: ./data)
#   PHOTON_JAR    path to photon-1.x.jar         (default: ./photon.jar)
#   JAVA          java 21+ binary                (default: java)
#   DUMP_CACHE    reuse downloads in this dir    (default: $DATA_DIR/dumps)
#   THREADS       import threads                 (default: 2)
set -euo pipefail

DATA_DIR="${DATA_DIR:-./data}"
PHOTON_JAR="${PHOTON_JAR:-./photon.jar}"
JAVA="${JAVA:-java}"
DUMP_CACHE="${DUMP_CACHE:-$DATA_DIR/dumps}"
THREADS="${THREADS:-2}"
BASE="https://download1.graphhopper.com/public/asia"
COUNTRIES=(malaysia singapore)

mkdir -p "$DATA_DIR" "$DUMP_CACHE"

for country in "${COUNTRIES[@]}"; do
  file="$DUMP_CACHE/$country.jsonl.zst"
  url="$BASE/$country/photon-dump-$country-1.0-latest.jsonl.zst"
  echo "==> downloading $country"
  # -z: only fetch when the server copy is newer than the one we have.
  since=()
  if [ -f "$file" ]; then since=(-z "$file"); fi
  curl -fsSL --retry 3 ${since[@]+"${since[@]}"} -o "$file.part" "$url" || { rm -f "$file.part"; exit 1; }
  if [ -s "$file.part" ]; then mv "$file.part" "$file"; else rm -f "$file.part"; fi
  zstd -tq "$file"
done

# A dump is: one header line, one CountryInfo line, then a place per line.
# Keep the first file whole and only the places of the rest — two headers in
# one stream would end the import early. Countries stay in sorted order
# (my < sg), which the dump header promises.
merged() {
  zstd -dc "$DUMP_CACHE/${COUNTRIES[0]}.jsonl.zst"
  for country in "${COUNTRIES[@]:1}"; do
    zstd -dc "$DUMP_CACHE/$country.jsonl.zst" | tail -n +3
  done
}

NEXT="$DATA_DIR/next"
rm -rf "$NEXT"
mkdir -p "$NEXT"

echo "==> importing (this takes a few minutes)"
merged | "$JAVA" -jar "$PHOTON_JAR" import \
  -import-file - \
  -data-dir "$NEXT" \
  -languages en,ms,zh,ta \
  -j "$THREADS"

# Swap in the new index; keep one previous copy to roll back to.
rm -rf "$DATA_DIR/previous"
if [ -d "$DATA_DIR/current" ]; then mv "$DATA_DIR/current" "$DATA_DIR/previous"; fi
mv "$NEXT" "$DATA_DIR/current"
echo "==> index ready in $DATA_DIR/current — restart photon to serve it"
