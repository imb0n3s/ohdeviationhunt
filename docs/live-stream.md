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
Silent audio track (no music = no DMCA). Stream title idea: "Deviation Hunt 24/7 — play in chat with !secure".
