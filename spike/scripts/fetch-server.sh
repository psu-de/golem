#!/usr/bin/env bash
# Fetches the vanilla server.jar for a Minecraft version through Mojang's version manifest and
# verifies its SHA-1. Usage: scripts/fetch-server.sh [version]   (default 1.21.4)
# Output: server/<version>/server.jar plus server/<version>/version.json (the manifest entry).
set -euo pipefail
VERSION="${1:-1.21.4}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HERE/server/$VERSION"
MANIFEST_URL="https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
mkdir -p "$DIR"
if [[ -f "$DIR/server.jar" && -f "$DIR/server.sha1" ]] && echo "$(cat "$DIR/server.sha1")  $DIR/server.jar" | sha1sum -c --status; then
  echo "server.jar $VERSION already present and verified"; exit 0
fi
curl -fsSL "$MANIFEST_URL" -o "$DIR/version_manifest_v2.json"
VERSION_URL="$(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const v = m.versions.find((x) => x.id === process.argv[2]);
  if (!v) { console.error("version not in manifest: " + process.argv[2]); process.exit(1); }
  console.log(v.url);' "$DIR/version_manifest_v2.json" "$VERSION")"
curl -fsSL "$VERSION_URL" -o "$DIR/version.json"
read -r JAR_URL JAR_SHA1 JAVA_MAJOR < <(node -e '
  const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  console.log(v.downloads.server.url, v.downloads.server.sha1, v.javaVersion.majorVersion);' "$DIR/version.json")
echo "server.jar $VERSION: $JAR_URL (sha1 $JAR_SHA1, needs Java $JAVA_MAJOR)"
curl -fsSL "$JAR_URL" -o "$DIR/server.jar.part"
echo "$JAR_SHA1  $DIR/server.jar.part" | sha1sum -c --status || { echo "SHA-1 mismatch" >&2; exit 1; }
mv "$DIR/server.jar.part" "$DIR/server.jar"
echo "$JAR_SHA1" > "$DIR/server.sha1"
JAVA_HAVE="$(java -XshowSettings:properties -version 2>&1 | sed -n 's/.*java.specification.version = //p')"
echo "java.specification.version=$JAVA_HAVE (required >= $JAVA_MAJOR)"
[[ "$JAVA_HAVE" -ge "$JAVA_MAJOR" ]] || { echo "Java $JAVA_MAJOR or newer required" >&2; exit 1; }
