#!/usr/bin/env bash
# Runs every experiment in sequence (each starts and stops its own server; they share one port).
# Total wall time about 45 minutes, dominated by E1's 10-minute run.
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/fetch-server.sh 1.21.4
./scripts/datagen.sh 1.21.4
./scripts/extract-shapes.sh 1.21.4
mkdir -p results/{e0,e1,e2,e3,e4,e5,e6}/raw
node experiments/e0-versions.mjs              > results/e0/raw/run.log 2>&1
node experiments/e1-clock.mjs --minutes 10    > results/e1/raw/run.log 2>&1
node experiments/e2-flush.mjs                 > results/e2/raw/run.log 2>&1
node experiments/e3-verdicts.mjs              > results/e3/raw/run.log 2>&1
node experiments/e4-attribution.mjs --reps 3  > results/e4/raw/run.log 2>&1
node experiments/e5-pathfinder.mjs            > results/e5/raw/run.log 2>&1
node experiments/e6-data.mjs                  > results/e6/raw/run.log 2>&1
echo "all experiments done; summaries in results/*/summary.json"
