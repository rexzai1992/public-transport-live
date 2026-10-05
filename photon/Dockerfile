# Self-hosted Photon place search for Malaysia + Singapore.
#
#   docker compose -f photon/docker-compose.yml up -d --build
#
# First start builds the index (a few minutes); later starts reuse it.
FROM eclipse-temurin:21-jre

ARG PHOTON_VERSION=1.3.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl zstd ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /photon
RUN curl -fsSL -o photon.jar \
    "https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar"

COPY build-index.sh synonyms.json entrypoint.sh ./
RUN chmod +x build-index.sh entrypoint.sh

ENV DATA_DIR=/photon/data PHOTON_JAR=/photon/photon.jar JAVA=java
VOLUME /photon/data
EXPOSE 2322

ENTRYPOINT ["./entrypoint.sh"]
