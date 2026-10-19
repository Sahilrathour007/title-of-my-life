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
3. In **Authentication → Sign In / Providers**, enable **Allow anonymous sign-ins**.
4. Copy **Project URL** and the **anon / publishable key** from Project Settings → API into [`config.js`](config.js).

The anon key is safe to publish; Row Level Security only lets each anonymous visitor write rows as themselves.

## Deploy on GitHub Pages

Settings → Pages → Deploy from branch → `main` / root. That's it.

## Before you open it to the public

Anonymous + free text means you **will** get spam and, eventually, something hurtful. At minimum, add rate limiting (Supabase → Auth → Rate Limits), a way to report or hide a script, and a moderator view.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page structure: welcome, two writing steps, the wall |
| `styles.css` | Warm theme, light and dark |
| `app.js` | Flow, wall rendering, local and Supabase storage |
| `config.js` | Your Supabase URL and anon key |
| `supabase/schema.sql` | Tables and security policies |
