# Deviation Hunt 24/7 stream

The page `https://deviationhunt.ohwikiguide.com/live/<channel login>` (1920×1080) is made to be streamed
nonstop: the channel's OBS Source (deviation card + countdown) in the middle, how to play, the next-spawn
timer (or "say hi in chat to wake them up" when chat has been quiet), recent catches and the leaderboards.
The bot's own channel is a game channel automatically (index.js; BOT_CHANNEL_GAME=0 turns it off), so the
24/7 stream is `/live/ohdeviationhunt` on twitch.tv/ohdeviationhunt.

## Streaming it (any small Linux VPS with Docker)
`streamer/` has a Dockerfile + stream.sh: Xvfb + Chromium (kiosk) + ffmpeg → rtmp://live.twitch.tv/app.
    docker build -t dh-stream streamer/
    docker run -d --restart=always --name dh-stream -e STREAM_KEY=... dh-stream
STREAM_KEY comes from the OHDeviationHunt Twitch dashboard (Settings → Stream). B pastes it himself; never
commit it. Optional env: PAGE_URL, BITRATE (default 3000k). ffmpeg restarts every 24h and after any drop.
~3 Mbps ≈ 1 TB/month of upload, so a VPS with included bandwidth is cheaper than Railway egress.
Audio (B 2026-10-07): PulseAudio null sink "mix" in the container; Chromium (the OBS Source spawn alert on /live) and
Spotify play into it; ffmpeg streams mix.monitor (falls back to silence if PulseAudio fails).
Spotify = go-librespot v0.10.3 (spotify.sh) as Connect device "Deviation Hunt 24/7", logged in once with device_auth
(the log prints `[spotify] PAIR: ... code XXXX` → spotify.com/pair while signed in as the OHDeviationHunt Spotify
Premium account). Login + playlist + volume persist in the docker volume dh-spotify (/spotify). It keeps the playlist
playing (shuffle + repeat, resumes if paused >1 min). `docker exec dh-stream playlist <link>`, `docker exec dh-stream musicvol 40`.
Update the box: rerun install.sh (keeps the stream key from the running container). B accepted the DMCA risk; suggested
turning off Store past broadcasts on the OHDeviationHunt channel. Stream title idea: "Deviation Hunt 24/7 — play in chat with !secure".
