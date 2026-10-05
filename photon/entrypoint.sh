#!/usr/bin/env bash
# Build the index on first start, then serve it.
set -euo pipefail

if [ ! -d "$DATA_DIR/current" ]; then
  ./build-index.sh
fi

exec "$JAVA" ${JAVA_OPTS:-} -jar "$PHOTON_JAR" serve \
  -data-dir "$DATA_DIR/current" \
  -listen-ip 0.0.0.0 \
  -listen-port 2322 \
  -synonym-file ./synonyms.json \
  -max-results 20 \
  -query-timeout 5
