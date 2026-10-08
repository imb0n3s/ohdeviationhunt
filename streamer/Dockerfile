# 24/7 stream box for Deviation Hunt — runs on any small Linux server / VPS.
# Stage 1: build go-librespot (an open-source Spotify Connect player) so the stream can play a Spotify playlist.
FROM golang:1.25-bookworm AS spotify
RUN apt-get update && apt-get install -y --no-install-recommends \
      libogg-dev libvorbis-dev libflac-dev libmpg123-dev libasound2-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v0.10.3 https://github.com/devgianlu/go-librespot /src \
    && cd /src && go build -o /go-librespot ./cmd/daemon

# Stage 2: the stream box — hidden browser + PulseAudio mixer + ffmpeg to Twitch.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb ffmpeg fonts-dejavu fonts-noto-color-emoji ca-certificates \
      pulseaudio pulseaudio-utils curl jq \
      libogg0 libvorbis0a libvorbisenc2 libflac12 libmpg123-0 libasound2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=spotify /go-librespot /usr/local/bin/go-librespot
COPY stream.sh /stream.sh
COPY spotify.sh /spotify.sh
COPY playlist /usr/local/bin/playlist
COPY musicvol /usr/local/bin/musicvol
RUN chmod +x /stream.sh /spotify.sh /usr/local/bin/playlist /usr/local/bin/musicvol
ENV CHROME=chromium XDG_RUNTIME_DIR=/tmp/xdg
# Spotify login + chosen playlist live here (docker volume dh-spotify), so they survive rebuilds
VOLUME /spotify
CMD ["/stream.sh"]
