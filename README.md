# Title of My Life

> If your life were a film, what would it be called?

A small, anonymous website. Visitors give their life a film title, write a short scene from the life they want, and pin it to a shared wall where others can read it, love it, and leave a kind word.

It's a warmer rework of an earlier dark "theatre" version:

- **A welcome screen** that explains the three steps before asking for anything
- **Golden-hour palette** (cream, peach, terracotta) with automatic dark mode
- **Title ideas and writing nudges** so a blank page isn't scary
- **A progress bar**, gentle validation copy, and a thank-you moment after posting
- **Kind-first wall**: "Love this" instead of "Like", "Leave a kind word…" comments, newest / most-loved sorting
- Fully anonymous: no names, no emails, no accounts, no tracking
- **Anonymous ID**: every visitor gets a private code like `AMBER-FOX-7Q4K-9XPM` on their first visit. They can copy it, save it (the share sheet on phones, a .txt file on computers) and use it to get their script back on any device
- **Background video** that fills any screen, with a separate phone cut, a pause button, and a still image for people who turn off motion or save data

## Run it

It's plain HTML, CSS and JavaScript — no build step.

```bash
npx serve .
# or: python3 -m http.server
```

With no database configured it runs in **local mode**: scripts live in your browser only, next to three labelled example scripts.

## Turn on the shared wall

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy **Project URL** and the **anon / publishable key** from Project Settings → API into [`config.js`](config.js).

The anon key is safe to publish. The tables are read-only to the public, and every write goes through database functions that check the visitor's ID on the server.

## Background video

Your video is 16:9, but most visitors hold a phone upright (about 9:19.5). Covering that screen with a 16:9 video
**cuts off about two-thirds of the frame**, so only the middle third is left. You have two options:

1. **Best:** let the script make a 9:16 phone version for you (needs [ffmpeg](https://ffmpeg.org/download.html)):
   ```bash
   tools/prepare-video.sh my-video.mp4          # phone cut taken from the centre
   tools/prepare-video.sh my-video.mp4 0.3      # phone cut taken left of centre
   ```
   It writes `media/background.mp4` (1280 px, 15 s max, silent), a phone cut, WebM copies for browsers without MP4 support, and `media/poster.jpg`.
   Then set `backgroundVideoMobile: "media/background-mobile.mp4"` in `config.js`.
2. **Quick:** keep one file and choose which part survives on phones with `videoFocusMobile` in `config.js` (`"50% 50%"` = centre).

Rules that keep it fast and kind on phones:
- Aim for **under 3 MB**. Phones on mobile data load it before they can read anything.
- No sound. Browsers only autoplay muted video; the site strips audio anyway.
- Put the interesting part of the frame in the middle third.
- `videoOverlay` (0 to 1) controls how much the page colour washes over the video. Only lower it if text stays easy to read.
- People who turn on "reduce motion" or data saver get the poster image instead of the video. Low Power Mode on iPhone can also block autoplay, so a good poster matters.

## The anonymous ID

- Made in the browser on first visit from a secure random source and kept in that browser's local storage. Clearing browser data deletes it, which is why the site asks people to save it.
- Only the ID's SHA-256 hash is stored with scripts, likes and comments. Cards show a short public tag such as `#A3F9`, never the ID itself.
- The ID works like a password: anyone who has it can post as that person. There is no "forgot my ID", because no name or email exists to recover it with.

## Deploy on GitHub Pages

Settings → Pages → Deploy from branch → `main` / root. That's it.

## Before you open it to the public

Anonymous + free text means you **will** get spam and, eventually, something hurtful. At minimum, add a way to report or hide a script, a moderator view, and rate limiting. Because nobody logs in, anyone can make fresh IDs, so the ID alone does nothing to stop spam.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page structure: welcome, two writing steps, the wall |
| `styles.css` | Warm theme, light and dark |
| `app.js` | Flow, wall rendering, local and Supabase storage |
| `config.js` | Supabase keys and background video settings |
| `media/` | Your background video and poster image |
| `tools/prepare-video.sh` | Makes web-ready desktop and phone videos from your file |
| `supabase/schema.sql` | Tables, security rules and write functions |
