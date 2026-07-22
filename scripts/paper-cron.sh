#!/usr/bin/env bash
# Cron wrapper for the paper 0DTE research tick. Gates to ET weekday entry
# hours (the engine enforces the exact 9:45-14:00 window; this just avoids
# useless Claude calls outside it). Timezone-proof: computes ET inside.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

H=$((10#$(TZ=America/New_York date +%H)))
M=$((10#$(TZ=America/New_York date +%M)))
D=$((10#$(TZ=America/New_York date +%u)))   # 1=Mon .. 7=Sun
NOW=$((H * 60 + M))

if [ "$D" -le 5 ] && [ "$NOW" -ge 580 ] && [ "$NOW" -le 845 ]; then   # 9:40-14:05 ET
  node scripts/paper-research.mjs >>/tmp/robinview-paper-cron.log 2>&1
else
  echo "$(date) skipped - outside ET entry window" >>/tmp/robinview-paper-cron.log
fi
