#!/bin/sh
set -eu
mkdir -p /data/analyses /data/admin /home/node
chown -R node:node /data /home/node
# runuser keeps the root home. The node user cannot read /root.
exec runuser -u node --preserve-environment -- \
  env HOME=/home/node USER=node LOGNAME=node \
  node scripts/auto-analyze.mjs \
  --serve \
  --host "${REA_BIND:-0.0.0.0}" \
  --port "${REA_ANALYZE_PORT:-4174}"
