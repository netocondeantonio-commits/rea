#!/bin/sh
set -eu
mkdir -p /data/analyses /data/admin
chown -R node:node /data
exec runuser -u node --preserve-environment -- \
  node scripts/auto-analyze.mjs \
  --serve \
  --host "${REA_BIND:-0.0.0.0}" \
  --port "${REA_ANALYZE_PORT:-4174}"
