@echo off
rem Double-click me. I turn the video you put in the media folder into web-ready background files.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-video.ps1" %*
echo.
pause
