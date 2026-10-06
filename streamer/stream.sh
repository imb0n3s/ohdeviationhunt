#!/usr/bin/env bash
# 24/7 Deviation Hunt stream: opens PAGE_URL in a hidden browser and sends it to Twitch with ffmpeg.
# Env: STREAM_KEY (from the Twitch dashboard — set it on the server, never commit it)
#      PAGE_URL   (default https://deviationhunt.ohwikiguide.com/live/ohdeviationhunt)
#      BITRATE    (default 2500k)   OUT_RES (default 1280x720; 1920x1080 needs ~4 cores)   INGEST (default rtmp://live.twitch.tv/app)   CHROME (browser binary)
set -u
PAGE_URL="${PAGE_URL:-https://deviationhunt.ohwikiguide.com/live/ohdeviationhunt}"
BITRATE="${BITRATE:-2500k}"
OUT_RES="${OUT_RES:-1280x720}"   # page renders at 1080p, sent at 720p (light on a 2-core server)
INGEST="${INGEST:-rtmp://live.twitch.tv/app}"
CHROME="${CHROME:-chromium}"
OUT="${OUT_URL:-$INGEST/${STREAM_KEY:?set STREAM_KEY}}"
export DISPLAY=:99

Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
sleep 2
while true; do
  "$CHROME" --no-sandbox --kiosk --start-fullscreen --window-position=0,0 --window-size=1920,1080 \
    --disable-infobars --noerrdialogs --hide-scrollbars --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required \
    --user-data-dir=/tmp/chrome-profile "$PAGE_URL" >/dev/null 2>&1 &
  CPID=$!
  sleep 8
  # silent audio track (Twitch expects one); 30 fps, keyframe every 2 s
  timeout 24h ffmpeg -hide_banner -loglevel warning \
    -f x11grab -framerate 30 -video_size 1920x1080 -draw_mouse 0 -i :99.0 \
    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -vf "scale=${OUT_RES/x/:}:flags=bicubic" -c:v libx264 -preset veryfast -tune zerolatency -b:v "$BITRATE" -maxrate "$BITRATE" -bufsize 6000k \
    -pix_fmt yuv420p -g 60 -keyint_min 60 -c:a aac -b:a 96k -f flv "$OUT"
  echo "[stream] ffmpeg stopped ($?) — restarting in 5s" >&2
  kill "$CPID" 2>/dev/null; sleep 5   # fresh browser each day / after any drop
done
