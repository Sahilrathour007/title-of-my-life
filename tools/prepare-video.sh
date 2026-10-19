#!/usr/bin/env bash
# Turns your 16:9 video into web-ready background files in media/.
# Usage: tools/prepare-video.sh path/to/your-video.mov [mobile-crop-x]
#   mobile-crop-x: where the 9:16 phone cut sits, 0 = left edge, 0.5 = centre (default), 1 = right edge.
# Needs ffmpeg (https://ffmpeg.org/download.html).
set -euo pipefail
in="${1:?Usage: tools/prepare-video.sh input-video [mobile-crop-x]}"
x="${2:-0.5}"
out="$(cd "$(dirname "$0")/.." && pwd)/media"
mkdir -p "$out"

# Background video: silent, 1280px wide, 24 fps, ~15 s max, small enough for phones on mobile data.
ffmpeg -y -i "$in" -t 15 -an -vf "scale=1280:-2,fps=24" -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf 28 -preset slow -movflags +faststart "$out/background.mp4"

# Upright phone cut: a 9:16 slice of the frame, 720x1280.
ffmpeg -y -i "$in" -t 15 -an -vf "crop=ih*9/16:ih:(iw-ih*9/16)*$x:0,scale=720:1280,fps=24" -c:v libx264 -profile:v high \
  -pix_fmt yuv420p -crf 30 -preset slow -movflags +faststart "$out/background-mobile.mp4"

# WebM twins for browsers without H.264 (the site picks them automatically).
ffmpeg -y -i "$out/background.mp4" -an -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 "$out/background.webm"
ffmpeg -y -i "$out/background-mobile.mp4" -an -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 "$out/background-mobile.webm"

# Poster: the first frame as a still image.
ffmpeg -y -i "$in" -frames:v 1 -vf "scale=1280:-2" -q:v 4 -update 1 "$out/poster.jpg"

ls -lh "$out"
echo
echo "Done. To use the phone cut, set backgroundVideoMobile: \"media/background-mobile.mp4\" in config.js."
