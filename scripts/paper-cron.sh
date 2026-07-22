#!/usr/bin/env bash
# Cron wrapper for the paper 0DTE research tick. Gates to ET weekday entry
# hours (the engine enforces the exact 9:45-14:00 window; this just avoids
# useless Claude calls outside it). Timezone-proof: computes ET inside.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

# Self-heal: if no RobinView API is answering on :8787, start the production
# server (API + built app in one process). The health probe prevents duplicate
# server processes from ever fighting over the port.
if ! curl -s -m 3 -o /dev/null "http://localhost:8787/api/health"; then
  nohup npm start >/tmp/robinview-server.log 2>&1 &
  echo "$(date) started RobinView server (was down)" >>/tmp/robinview-paper-cron.log
  sleep 8
fi

H=$((10#$(TZ=America/New_York date +%H)))
M=$((10#$(TZ=America/New_York date +%M)))
D=$((10#$(TZ=America/New_York date +%u)))   # 1=Mon .. 7=Sun
NOW=$((H * 60 + M))

if [ "$D" -le 5 ] && [ "$NOW" -ge 570 ] && [ "$NOW" -lt 580 ]; then   # 9:30-9:40 ET: daily forecast
  node scripts/paper-forecast.mjs >>/tmp/robinview-paper-cron.log 2>&1
elif [ "$D" -le 5 ] && [ "$NOW" -ge 580 ] && [ "$NOW" -le 845 ]; then   # 9:40-14:05 ET: 0DTE research
  node scripts/paper-research.mjs >>/tmp/robinview-paper-cron.log 2>&1
else
  echo "$(date) skipped - outside ET entry window" >>/tmp/robinview-paper-cron.log
fi

# Review sweep: post-mortem any closed-but-unreviewed trades (cheap no-op when
# there are none). Runs on every weekday tick so 15:45 closes get reviewed at
# the next hour and their lessons are in the prompt by the next morning.
if [ "$D" -le 5 ]; then
  node scripts/paper-review.mjs >>/tmp/robinview-paper-cron.log 2>&1
fi
