# Windows version of prepare-video.sh: turns your 16:9 video into web-ready, seamlessly looping background files in media\.
# Easiest: double-click tools\prepare-video.bat. It finds the video you put in media\ by itself.
# Or:      powershell -ExecutionPolicy Bypass -File tools\prepare-video.ps1 [video] [-CropX 0.5] [-MaxSeconds 15] [-LoopFade 1]
#   CropX:    where the 9:16 phone cut sits, 0 = left edge, 0.5 = centre, 1 = right edge
#   LoopFade: seconds of crossfade from the end back into the start, so the loop has no visible jump; 0 = off
param(
  [string]$Video = "",
  [double]$CropX = 0.5,
  [double]$MaxSeconds = 15,
  [double]$LoopFade = 1
)
$ErrorActionPreference = "Stop"
$inv = [cultureinfo]::InvariantCulture
function N([double]$v){ $v.ToString("0.###", $inv) }   # dots, never commas, whatever the Windows region setting
function Fail($msg){ Write-Host ""; Write-Host $msg -ForegroundColor Red; exit 1 }

$root  = Split-Path -Parent $PSScriptRoot
$media = Join-Path $root "media"
$orig  = Join-Path $media "_original"
$outputs = @("background.mp4","background-mobile.mp4","background.webm","background-mobile.webm")

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Fail ("ffmpeg is not installed. Open PowerShell and run:`n`n    winget install --id Gyan.FFmpeg -e`n`n" +
        "Then close this window, open a new one and run this script again.")
}

# Find the video: the argument, else any video in media\ that isn't one of our outputs, else one in media\_original\.
if (-not $Video) {
  $exts = ".mov",".mp4",".m4v",".mkv",".webm",".avi"
  $found = Get-ChildItem -LiteralPath $media -File | Where-Object { $exts -contains $_.Extension.ToLower() -and $outputs -notcontains $_.Name.ToLower() } | Select-Object -First 1
  if (-not $found -and (Test-Path $orig)) {
    $found = Get-ChildItem -LiteralPath $orig -File | Where-Object { $exts -contains $_.Extension.ToLower() } | Select-Object -First 1
  }
  if (-not $found) { Fail "No video found. Put your video in the media folder, then run this again." }
  $Video = $found.FullName
}
if (-not (Test-Path -LiteralPath $Video)) { Fail "Can't find $Video" }
Write-Host "Using: $Video"

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("toml-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
function Run([string[]]$a){ & ffmpeg -y -v error @a; if ($LASTEXITCODE -ne 0) { Fail "ffmpeg failed (step: $($a[-1]))" } }

try {
  # 1. Master clip: silent, 24 fps, at most MaxSeconds. iPhone HDR footage is tone-mapped to normal colours,
  #    otherwise it looks grey and washed out in browsers.
  $len = [double]::Parse((& ffprobe -v error -show_entries format=duration -of csv=p=0 "$Video").Trim(), $inv)
  $len = [math]::Min($len, $MaxSeconds)
  $trc = (& ffprobe -v error -select_streams v:0 -show_entries stream=color_transfer -of csv=p=0 "$Video").Trim()
  $vf = "fps=24,format=yuv420p"
  if ($trc -eq "arib-std-b67" -or $trc -eq "smpte2084") {
    Write-Host "HDR video detected, converting colours for the web..."
    $vf = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:param=0.8:desat=0,zscale=t=bt709:m=bt709:r=tv,fps=24,format=yuv420p"
  }
  Write-Host "1/5 Preparing the clip..."
  Run @("-i",$Video,"-t",(N $len),"-an","-vf",$vf,"-c:v","libx264","-crf","16","-preset","fast",(Join-Path $tmp "master.mp4"))

  # 2. Seamless loop: play from LoopFade s to the end, crossfading the last LoopFade s into the opening LoopFade s,
  #    so the final frame equals the first and the jump back to the start is invisible.
  $src = (Join-Path $tmp "master.mp4")
  if ($LoopFade -gt 0 -and $len -gt 4 * $LoopFade) {
    Write-Host "2/5 Making the loop seamless..."
    $f = N $LoopFade; $off = N ($len - 2 * $LoopFade)
    Run @("-i",$src,"-filter_complex",
      "[0:v]trim=start=$f,setpts=PTS-STARTPTS[a];[0:v]trim=end=$f,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${f}:offset=$off,format=yuv420p[v]",
      "-map","[v]","-c:v","libx264","-crf","16","-preset","fast",(Join-Path $tmp "loop.mp4"))
    $src = (Join-Path $tmp "loop.mp4")
  } else { Write-Host "2/5 Clip too short for a loop fade, skipping." }

  Write-Host "3/5 Desktop video..."
  Run @("-i",$src,"-vf","scale=1280:-2","-c:v","libx264","-profile:v","high","-pix_fmt","yuv420p","-crf","28","-preset","slow","-movflags","+faststart",(Join-Path $media "background.mp4"))

  Write-Host "4/5 Phone video (9:16)..."
  Run @("-i",$src,"-vf","crop=ih*9/16:ih:(iw-ih*9/16)*$(N $CropX):0,scale=720:1280","-c:v","libx264","-profile:v","high","-pix_fmt","yuv420p","-crf","30","-preset","slow","-movflags","+faststart",(Join-Path $media "background-mobile.mp4"))

  Write-Host "5/5 WebM copies and poster image..."
  Run @("-i",(Join-Path $media "background.mp4"),"-c:v","libvpx-vp9","-b:v","0","-crf","40","-row-mt","1",(Join-Path $media "background.webm"))
  Run @("-i",(Join-Path $media "background-mobile.mp4"),"-c:v","libvpx-vp9","-b:v","0","-crf","42","-row-mt","1",(Join-Path $media "background-mobile.webm"))
  Run @("-i",$src,"-frames:v","1","-vf","scale=1280:-2","-q:v","4","-update","1",(Join-Path $media "poster.jpg"))
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

# Move the big original out of media\ so it isn't published with the site (media\_original is ignored by git).
if ((Split-Path -Parent (Resolve-Path -LiteralPath $Video)) -eq (Resolve-Path $media).Path) {
  New-Item -ItemType Directory -Force -Path $orig | Out-Null
  Move-Item -LiteralPath $Video -Destination $orig -Force
  Write-Host "Moved your original video to media\_original (kept, but not published)."
}

# Turn on the phone cut in config.js.
$cfg = Join-Path $root "config.js"
$text = [IO.File]::ReadAllText($cfg)
$new = $text -replace 'backgroundVideoMobile:\s*""', 'backgroundVideoMobile: "media/background-mobile.mp4"'
if ($new -ne $text) { [IO.File]::WriteAllText($cfg, $new); Write-Host "Turned on the phone video in config.js." }

Write-Host ""
Get-ChildItem -LiteralPath $media -File | Where-Object { $_.Extension -ne ".txt" } | ForEach-Object { "{0,-26} {1,8:N2} MB" -f $_.Name, ($_.Length / 1MB) }
Write-Host ""
Write-Host "Done! Open index.html (or refresh it) to see your video." -ForegroundColor Green
