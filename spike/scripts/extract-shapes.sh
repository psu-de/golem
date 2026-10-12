#!/usr/bin/env bash
# E6: compiles and runs tools/ShapeExtractor.java against the pinned server.jar (needs
# scripts/fetch-server.sh and scripts/datagen.sh first; the latter unpacks the bundled libraries).
# Output: server/<version>/extracted/blocks-shapes.json
set -euo pipefail
VERSION="${1:-1.21.4}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HERE/server/$VERSION"
CP="$DIR/datagen/versions/$VERSION/server-$VERSION.jar:$(find "$DIR/datagen/libraries" -name '*.jar' | tr '\n' ':')"
mkdir -p "$DIR/extracted/classes"
javac -d "$DIR/extracted/classes" "$HERE/tools/ShapeExtractor.java"
(cd "$DIR/extracted" && java -cp "$CP:classes" golem.spike.ShapeExtractor "$DIR/server_mappings.txt" "$DIR/extracted/blocks-shapes.json")
