#!/usr/bin/env bash
# Turns your 16:9 video into web-ready, seamlessly looping background files in media/.
# Usage: tools/prepare-video.sh path/to/your-video.mov [mobile-crop-x]
#   mobile-crop-x: where the 9:16 phone cut sits, 0 = left edge, 0.5 = centre (default), 1 = right edge.
# Options (environment variables):
#   MAX_SECONDS=60   length to keep from the start of your video
#   LOOP_FADE=1      seconds of crossfade from the end back into the start, so the loop has no visible jump; 0 = off
# Needs ffmpeg (https://ffmpeg.org/download.html).
set -euo pipefail
in="${1:?Usage: tools/prepare-video.sh input-video [mobile-crop-x]}"
x="${2:-0.5}"
max="${MAX_SECONDS:-60}"
fade="${LOOP_FADE:-1}"
out="$(cd "$(dirname "$0")/.." && pwd)/media"
mkdir -p "$out"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# 1. Master clip: silent, 24 fps, at most $max seconds. No audio track also avoids the small gap audio adds at each loop.
len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
len=$(awk -v a="$len" -v b="$max" 'BEGIN{print (a<b)?a:b}')
#    iPhone HDR footage is tone-mapped to normal colours, otherwise it looks grey and washed out in browsers.
vf="fps=24,format=yuv420p"
trc=$(ffprobe -v error -select_streams v:0 -show_entries stream=color_transfer -of csv=p=0 "$in")
if [ "$trc" = "arib-std-b67" ] || [ "$trc" = "smpte2084" ]; then
  echo "HDR video detected, converting colours for the web..."
  vf="zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:param=0.8:desat=0,zscale=t=bt709:m=bt709:r=tv,fps=24,format=yuv420p"
fi
ffmpeg -y -v error -i "$in" -t "$len" -an -vf "$vf" -c:v libx264 -crf 16 -preset fast "$tmp/master.mp4"

# 2. Seamless loop: play from $fade s to the end, crossfading the last $fade s into the opening $fade s.
#    The final frame then equals the first frame, so the jump back to the start is invisible.
if awk -v f="$fade" -v l="$len" 'BEGIN{exit !(f>0 && l>4*f)}'; then
  off=$(awk -v l="$len" -v f="$fade" 'BEGIN{print l-2*f}')
  ffmpeg -y -v error -i "$tmp/master.mp4" -filter_complex \
    "[0:v]trim=start=$fade,setpts=PTS-STARTPTS[a];[0:v]trim=end=$fade,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=$fade:offset=$off,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -crf 16 -preset fast "$tmp/loop.mp4"
else
  [ "$fade" != "0" ] && echo "Clip too short for a ${fade}s loop fade; skipping it."
  cp "$tmp/master.mp4" "$tmp/loop.mp4"
fi
src="$tmp/loop.mp4"

# 3. Desktop video: 1280 px wide, small enough for phones on mobile data.
ffmpeg -y -v error -i "$src" -vf "scale=1280:-2" -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf 29 -preset slow -movflags +faststart "$out/background.mp4"

# 4. Upright phone cut: a 9:16 slice of the frame, 720x1280.
ffmpeg -y -v error -i "$src" -vf "crop=ih*9/16:ih:(iw-ih*9/16)*$x:0,scale=720:1280" -c:v libx264 -profile:v high \
  -pix_fmt yuv420p -crf 32 -preset slow -movflags +faststart "$out/background-mobile.mp4"

# 5. WebM twins for browsers without H.264 (the site picks them automatically).
ffmpeg -y -v error -i "$out/background.mp4" -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 "$out/background.webm"
ffmpeg -y -v error -i "$out/background-mobile.mp4" -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 "$out/background-mobile.webm"

# 6. Poster: the loop's first frame, so the still and the video start on the same picture.
ffmpeg -y -v error -i "$src" -frames:v 1 -vf "scale=1280:-2" -q:v 4 -update 1 "$out/poster.jpg"

ls -lh "$out"
echo
echo "Done. Refresh the site to see your video."
