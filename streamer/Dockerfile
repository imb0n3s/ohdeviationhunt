# 24/7 stream box for Deviation Hunt — runs on any small Linux server / VPS.
# Hidden browser + PulseAudio mixer (spawn alert + background music) + ffmpeg to Twitch.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb ffmpeg fonts-dejavu fonts-noto-color-emoji ca-certificates \
      pulseaudio pulseaudio-utils mpv unzip procps \
    && rm -rf /var/lib/apt/lists/*
COPY stream.sh /stream.sh
COPY music.sh /music.sh
COPY musicvol /usr/local/bin/musicvol
RUN chmod +x /stream.sh /music.sh /usr/local/bin/musicvol
ENV CHROME=chromium XDG_RUNTIME_DIR=/tmp/xdg
# songs: the server folder /root/dh-music is mounted here (install.sh)
VOLUME /music
CMD ["/stream.sh"]
