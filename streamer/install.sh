#!/usr/bin/env bash
# One-command setup (or update) for the Deviation Hunt 24/7 stream on an Ubuntu server.
#   curl -fsSL https://raw.githubusercontent.com/imb0n3s/ohdeviationhunt/main/streamer/install.sh | sudo bash
# First time it asks for the Twitch stream key (typed on the server, never stored anywhere else). Running it again
# updates the stream box and keeps the key. Background music: put songs (or the downloaded .zip albums) in the
# server folder /root/dh-music — they play on shuffle under the spawn alert.
set -e
if ! command -v docker >/dev/null; then
  echo "Installing Docker..."; curl -fsSL https://get.docker.com | sh
fi
# reuse the stream key and playlist from the box that's already running, if there is one
OLD_ENV="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' dh-stream 2>/dev/null || true)"
KEY="${STREAM_KEY:-$(sed -n 's/^STREAM_KEY=//p' <<<"$OLD_ENV")}"
if [ -z "$KEY" ]; then
  echo; echo "Paste the OHDeviationHunt stream key (Twitch dashboard > Settings > Stream > Primary Stream key)."
  echo "Nothing will show while you paste — that's normal. Then press Enter."
  read -rs KEY < /dev/tty; echo
fi
[ -n "$KEY" ] || { echo "No stream key entered — stopping."; exit 1; }
mkdir -p /root/dh-music
echo "Building the stream box (takes several minutes the first time)..."
docker build -t dh-stream "https://github.com/imb0n3s/ohdeviationhunt.git#main:streamer"
docker rm -f dh-stream >/dev/null 2>&1 || true
docker run -d --name dh-stream --restart=always --shm-size=1g -v /root/dh-music:/music \
  -e STREAM_KEY="$KEY" dh-stream >/dev/null
unset KEY
sleep 25
if docker ps --filter name=dh-stream --filter status=running | grep -q dh-stream; then
  echo; echo "✅ Deviation Hunt is streaming to twitch.tv/ohdeviationhunt (give Twitch ~30 seconds)."
  echo "🎵 Music: $(docker exec dh-stream musicvol | head -1 | sed 's/.*(\(.*\))/\1/') in /root/dh-music — add songs or .zip albums there any time."
  echo; echo "   Check it:        docker logs --tail 20 dh-stream"
  echo "   Music volume:    docker exec dh-stream musicvol 60      (0-100, 0 = off)"
  echo "   Stop / start:    docker stop dh-stream  /  docker start dh-stream"
else
  echo "❌ The stream box didn't stay running. Show Claude this:"; docker logs --tail 40 dh-stream
fi
