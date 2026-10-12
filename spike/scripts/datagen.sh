#!/usr/bin/env bash
# Runs the vanilla data generator for a version (§18.1) into server/<version>/generated.
# Usage: scripts/datagen.sh [version]   (default 1.21.4; needs scripts/fetch-server.sh first)
set -euo pipefail
VERSION="${1:-1.21.4}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HERE/server/$VERSION"
[[ -f "$DIR/generated/reports/blocks.json" ]] && { echo "data generator output for $VERSION already present"; exit 0; }
mkdir -p "$DIR/datagen"
cd "$DIR/datagen"   # the bundler unpacks its libraries into the working directory
java -DbundlerMainClass=net.minecraft.data.Main -jar ../server.jar --all --output ../generated > ../datagen.log 2>&1
echo "data generator output in $DIR/generated ($(du -sh ../generated | cut -f1))"
