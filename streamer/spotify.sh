#!/usr/bin/env bash
# Spotify for the 24/7 stream: runs go-librespot as a Spotify Connect device called "Deviation Hunt 24/7" and keeps
# the chosen playlist playing (shuffle + repeat) forever. Audio goes to the PulseAudio mix that ffmpeg sends to Twitch.
# First run: the log shows  [spotify] PAIR ...  — go to spotify.com/pair (signed in as the OHDeviationHunt Spotify
# Premium account) and enter the code. The login is saved in /spotify, so it's only needed once.
# Change the playlist any time:  docker exec dh-stream playlist <spotify playlist link>
# Music volume (0-100):          docker exec dh-stream musicvol 40
CFG=/spotify
API=http://127.0.0.1:3678
mkdir -p "$CFG"
[ -n "${SPOTIFY_PLAYLIST:-}" ] && [ ! -s "$CFG/playlist" ] && echo "$SPOTIFY_PLAYLIST" > "$CFG/playlist"
[ -s "$CFG/volume" ] || echo "${MUSIC_VOLUME:-40}" > "$CFG/volume"
cat > "$CFG/config.yml" <<EOF
device_name: Deviation Hunt 24/7
device_type: speaker
audio_backend: pulseaudio
zeroconf_enabled: false
credentials:
  type: device_auth
server:
  enabled: true
  address: localhost
  port: 3678
volume_steps: 100
EOF

log() { echo "[spotify] $*"; }
# open.spotify.com/playlist/ID?si=... or spotify:playlist:ID -> spotify:playlist:ID
to_uri() { local s; s="$(tr -d '[:space:]' < "$CFG/playlist" 2>/dev/null)"; s="${s%%\?*}"
  case "$s" in spotify:*) echo "$s" ;; *open.spotify.com/*) s="${s#*open.spotify.com/}"; s="${s#intl-*/}"; echo "spotify:${s//\//:}" ;; *) echo "" ;; esac; }

# the player itself; restarts if it ever stops (expired pairing code, network drop...)
( while true; do go-librespot --config_dir "$CFG" 2>&1 | sed -u 's/^/[spotify] /'; log "player stopped — restarting in 10s"; sleep 10; done ) &

last_code="" paused_checks=0
while true; do
  sleep 15
  code="$(curl -fsS "$API/auth/code" 2>/dev/null | jq -r '.code // empty' 2>/dev/null)"
  if [ -n "$code" ]; then
    [ "$code" != "$last_code" ] && log "PAIR: on your phone or PC go to spotify.com/pair (signed in as the OHDeviationHunt Spotify account) and enter code  $code"
    last_code="$code"; continue
  fi
  uri="$(to_uri)"
  [ -z "$uri" ] && continue
  st="$(curl -sS -w '\n%{http_code}' "$API/status" 2>/dev/null)"; http="${st##*$'\n'}"; body="${st%$'\n'*}"
  [ "$http" = "000" ] && continue                      # player not up yet
  stopped=1; paused=0; cur=""
  if [ "$http" = "200" ]; then
    [ "$(jq -r '.stopped' <<<"$body" 2>/dev/null)" = "false" ] && stopped=0
    [ "$(jq -r '.paused' <<<"$body" 2>/dev/null)" = "true" ] && paused=1
    cur="$(jq -r '.context_uri // empty' <<<"$body" 2>/dev/null)"
  fi
  if [ $stopped = 1 ] || [ ! -e /tmp/.started ] || [ "$cur" != "$uri" -a -e /tmp/.switch ]; then
    curl -fsS -X POST -H 'content-type: application/json' -d '{"shuffle_context":true}' "$API/player/shuffle_context" >/dev/null 2>&1
    if curl -fsS -X POST -H 'content-type: application/json' -d "{\"uri\":\"$uri\"}" "$API/player/play" >/dev/null 2>&1; then
      sleep 3
      curl -fsS -X POST -H 'content-type: application/json' -d '{"repeat_context":true}' "$API/player/repeat_context" >/dev/null 2>&1
      curl -fsS -X POST -H 'content-type: application/json' -d "{\"volume\":$(cat "$CFG/volume")}" "$API/player/volume" >/dev/null 2>&1
      touch /tmp/.started; rm -f /tmp/.switch; log "playing $uri (shuffle + repeat, volume $(cat "$CFG/volume"))"
    fi
    paused_checks=0; continue
  fi
  # 24/7: if it's left paused for a minute, start it again
  if [ $paused = 1 ]; then paused_checks=$((paused_checks+1)); else paused_checks=0; fi
  if [ $paused_checks -ge 4 ]; then curl -fsS -X POST "$API/player/resume" >/dev/null 2>&1 && log "resumed"; paused_checks=0; fi
done
