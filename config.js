window.TOML_CONFIG = {
  // ---- Shared wall (see README → "Turn on the shared wall") ----
  // Leave empty and the site runs in "local mode": everything stays in this browser.
  // The anon key is meant to be public; the database only accepts writes through the functions in supabase/schema.sql.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // ---- Background video (see README → "Background video") ----
  // Put your files in the media/ folder. Leave backgroundVideo empty to turn the video off.
  backgroundVideo: "media/background.mp4",   // your 16:9 video, used on laptops and landscape screens
  backgroundVideoMobile: "media/background-mobile.mp4", // 9:16 cut for phones held upright; if it's missing, phones use backgroundVideo
  backgroundAnimated: "media/background-mobile.webp", // animated image shown when a phone blocks video autoplay (Low Power Mode, WhatsApp/Instagram browsers)
  backgroundPoster: "media/poster.jpg",       // still frame shown while loading, or instead of motion for people who turn motion off
  videoFocus: "50% 50%",                      // which part of the frame to keep when it's cropped ("50% 50%" = centre)
  videoFocusMobile: "50% 50%",                // same, for upright phones without a mobile cut (e.g. "30% 50%" keeps the left-centre)
  videoOverlay: 0.74                          // 0 = raw video, 1 = page colour only. Lower it only if text stays easy to read
};
