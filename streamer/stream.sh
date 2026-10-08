#!/usr/bin/env bash
# 24/7 Deviation Hunt stream: opens PAGE_URL in a hidden browser and sends it to Twitch with ffmpeg.
# Env: STREAM_KEY (from the Twitch dashboard — set it on the server, never commit it)
#      PAGE_URL   (default https://deviationhunt.ohwikiguide.com/live/ohdeviationhunt)
#      MUSIC_VOLUME (0-100, default 60; songs go in /music — see music.sh)
#      BITRATE    (default 2500k)   OUT_RES (default 1280x720; 1920x1080 needs ~4 cores)   INGEST (default rtmp://live.twitch.tv/app)   CHROME (browser binary)
set -u
PAGE_URL="${PAGE_URL:-https://deviationhunt.ohwikiguide.com/live/ohdeviationhunt}"
BITRATE="${BITRATE:-2500k}"
OUT_RES="${OUT_RES:-1280x720}"   # the 1920x1080 page is drawn straight at this size (zoomed out), so nothing has to be rescaled
INGEST="${INGEST:-rtmp://live.twitch.tv/app}"
CHROME="${CHROME:-chromium}"
OUT="${OUT_URL:-$INGEST/${STREAM_KEY:?set STREAM_KEY}}"
export DISPLAY=:99

# Audio: a PulseAudio "mix" that the browser (spawn alert) and the music player play into; ffmpeg streams that mix.
AUDIO_IN=(-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100)   # fallback: silence
mkdir -p "${XDG_RUNTIME_DIR:-/tmp/xdg}"
if command -v pulseaudio >/dev/null && pulseaudio -D --exit-idle-time=-1 --disallow-exit --log-target=stderr 2>/dev/null; then
  sleep 1
  pactl load-module module-null-sink sink_name=mix sink_properties=device.description=mix >/dev/null && pactl set-default-sink mix \
    && AUDIO_IN=(-thread_queue_size 1024 -f pulse -sample_rate 44100 -channels 2 -i mix.monitor) && echo "[stream] audio: PulseAudio mix"
  /music.sh &
fi

W="${OUT_RES%x*}"; H="${OUT_RES#*x}"
ZOOM=$(awk "BEGIN{printf \"%.4f\", $W/1920}")
Xvfb :99 -screen 0 "${W}x${H}x24" -nolisten tcp &
sleep 2
while true; do
  "$CHROME" --no-sandbox --kiosk --start-fullscreen --window-position=0,0 --window-size=1920,1080 --force-device-scale-factor="$ZOOM" \
    --disable-infobars --noerrdialogs --hide-scrollbars --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required \
    --user-data-dir=/tmp/chrome-profile "$PAGE_URL" >/dev/null 2>&1 &
  CPID=$!
  sleep 8
  # audio = the mix (spawn alert + music), or silence if PulseAudio isn't available; 30 fps, keyframe every 2 s
  timeout 24h ffmpeg -hide_banner -loglevel warning \
    -f x11grab -framerate 30 -video_size "${W}x${H}" -draw_mouse 0 -i :99.0 \
    "${AUDIO_IN[@]}" \
    -stats -stats_period 60 -c:v libx264 -preset veryfast -tune zerolatency -b:v "$BITRATE" -maxrate "$BITRATE" -bufsize 6000k \
    -pix_fmt yuv420p -g 60 -keyint_min 60 -af aresample=async=1000 -c:a aac -b:a 128k -ar 44100 -f flv "$OUT"
  echo "[stream] ffmpeg stopped ($?) — restarting in 5s" >&2
  kill "$CPID" 2>/dev/null; sleep 5   # fresh browser each day / after any drop
done
