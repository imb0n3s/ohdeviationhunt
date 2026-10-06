#!/usr/bin/env bash
# One-command setup for the Deviation Hunt 24/7 stream on a fresh Ubuntu server.
#   curl -fsSL https://raw.githubusercontent.com/imb0n3s/ohdeviationhunt/main/streamer/install.sh | sudo bash
# It asks for the Twitch stream key (typed on the server, never stored anywhere else), builds the stream
# box and starts it so it restarts by itself after crashes and reboots.
set -e
if ! command -v docker >/dev/null; then
  echo "Installing Docker..."; curl -fsSL https://get.docker.com | sh
fi
KEY="${STREAM_KEY:-}"
if [ -z "$KEY" ]; then
  echo; echo "Paste the OHDeviationHunt stream key (Twitch dashboard > Settings > Stream > Primary Stream key)."
  echo "Nothing will show while you paste — that's normal. Then press Enter."
  read -rs KEY < /dev/tty; echo
fi
[ -n "$KEY" ] || { echo "No stream key entered — stopping."; exit 1; }
echo "Building the stream box (takes a few minutes the first time)..."
docker build -t dh-stream "https://github.com/imb0n3s/ohdeviationhunt.git#main:streamer"
docker rm -f dh-stream >/dev/null 2>&1 || true
docker run -d --name dh-stream --restart=always --shm-size=1g -e STREAM_KEY="$KEY" dh-stream >/dev/null
unset KEY
sleep 15
if docker ps --filter name=dh-stream --filter status=running | grep -q dh-stream; then
  echo; echo "✅ Deviation Hunt is streaming to twitch.tv/ohdeviationhunt (give Twitch ~30 seconds)."
  echo "   Check it:   docker logs --tail 20 dh-stream"
  echo "   Stop it:    docker stop dh-stream     Start again: docker start dh-stream"
else
  echo "❌ The stream box didn't stay running. Show Claude this:"; docker logs --tail 40 dh-stream
fi
