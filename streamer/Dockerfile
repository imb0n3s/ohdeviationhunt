# 24/7 stream box for Deviation Hunt — runs on any small Linux server / VPS.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb ffmpeg fonts-dejavu fonts-noto-color-emoji ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY stream.sh /stream.sh
ENV CHROME=chromium
CMD ["/stream.sh"]
