#!/usr/bin/env bash
# Background music for the 24/7 stream: plays every song in /music (the server folder /root/dh-music) on shuffle,
# forever, into the PulseAudio mix that ffmpeg sends to Twitch (under the spawn alert).
# Add songs: copy .mp3/.flac/.ogg/.m4a/.wav files — or the .zip albums as downloaded — into /root/dh-music on the
# server. Zips are unpacked automatically and new songs are picked up within a minute.
# Volume (0-100): docker exec dh-stream musicvol 60      Off: docker exec dh-stream musicvol 0
MUSIC=/music
mkdir -p "$MUSIC"
[ -s "$MUSIC/.volume" ] || echo "${MUSIC_VOLUME:-60}" > "$MUSIC/.volume"
log() { echo "[music] $*"; }
count() { find "$MUSIC" -type f \( -iname '*.mp3' -o -iname '*.flac' -o -iname '*.ogg' -o -iname '*.opus' -o -iname '*.m4a' -o -iname '*.wav' \) | wc -l; }
unpack() { find "$MUSIC" -maxdepth 2 -type f -iname '*.zip' | while read -r z; do
  d="${z%.*}"; mkdir -p "$d" && unzip -oq "$z" -d "$d" && rm -f "$z" && log "unpacked $(basename "$z")"; done; }

while true; do
  unpack
  n=$(count); vol=$(cat "$MUSIC/.volume" 2>/dev/null || echo 60)
  if [ "$n" -eq 0 ] || [ "$vol" -eq 0 ]; then sleep 60; continue; fi
  log "playing $n songs on shuffle (volume $vol)"
  # restart every hour (or when musicvol is used) to pick up new songs
  timeout 1h mpv --no-video --really-quiet --ao=pulse --shuffle --loop-playlist=inf --volume="$vol" \
    --directory-mode=recursive "$MUSIC" >/dev/null 2>&1
  sleep 2
done
