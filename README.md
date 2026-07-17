# Keeo Lu — Portfolio Site Clone

A faithful, **fully self-contained** static reproduction of the Framer site
[`daily-start-813434.framer.app`](https://daily-start-813434.framer.app/)
(canonical: `keeolu.com`) — a 2D/3D motion-graphic designer's portfolio.

Every asset (images, videos, fonts, icons) is downloaded and served locally; the
site has **zero external network dependencies**.

## Run it

```bash
./serve.sh            # serves ./site at http://127.0.0.1:8848
# then open http://127.0.0.1:8848/
```

Any static file server works (`npx serve site`, nginx, GitHub Pages, Netlify,
Cloudflare Pages, …). It's plain HTML/CSS/JS — no build step, no framework, no
ES-module loader — so it can even be opened from `file://` (videos and fonts are
happiest over `http://`, though).

## What's here

```
site/                       ← THE DELIVERABLE (static site, deploy this folder)
├── index.html              ← home
├── motion.html             ← /motion
├── graphic.html            ← /graphic
├── 3d-fashion.html         ← /3d-fashion
├── photography.html        ← /photography
├── tangibles.html          ← /tangibles
└── assets/
    ├── images/   (524 files — incl. every responsive size variant)
    ├── videos/   (39 mp4 clips)
    ├── fonts/    (33 woff2 — Satoshi & the site's other faces)
    ├── media/    (misc)
    ├── framer-shim.js   ← reproduces the site's interactions (see below)
    ├── shim.css
    └── runtime/  ← original Framer JS bundle + search index (archived, unused —
                     the shim replaces it; kept for a complete asset scrape)

serve.sh                    ← local server helper
scripts/                    ← the build pipeline (re-runnable)
├── collect_urls.py         ← finds every asset URL in the raw pages → urls.tsv
├── download.py             ← mirrors all 619 assets into site/assets/
└── localize.py             ← rewrites raw Framer HTML → self-contained site/
*.raw.html                  ← original Framer HTML snapshots (build inputs)
```

## How it was built

The original is a Framer site: server-rendered HTML with ~100 KB of inline CSS,
all layout baked in, hydrated by a Framer React bundle loaded from
`framerusercontent.com`.

The clone **preserves Framer's exact SSR HTML + inline CSS** (so layout and the
three responsive breakpoints — ≥1800 / 1000–1799 / ≤999 px — are pixel-identical
by construction), and then:

1. **Downloads every asset** referenced across all six pages (`download.py`,
   619 URLs incl. every `?scale-down-to=` size variant).
2. **Rewrites every remote URL → local path** and every internal `./route` link
   → flat `route.html` (`localize.py`).
3. **Strips the Framer CDN runtime** (React module bundle, analytics, editor
   injector, module preloads) so nothing phones home.
4. **Injects the social-icon SVGs** (LinkedIn / Instagram / Email) that the
   original rendered via JS Material-Icon components.
5. **Adds `framer-shim.js`** — a small vanilla script that reproduces the
   interactions the React bundle used to provide.

To rebuild from scratch:

```bash
python3 scripts/collect_urls.py   # → urls.tsv
python3 scripts/download.py       # → site/assets/*  (network, ~460 MB)
python3 scripts/localize.py       # → site/*.html
```

## The interaction shim (`framer-shim.js`)

| Behaviour | Reproduced how |
|-----------|----------------|
| On-load **fade-up** appear animation | every `[data-framer-appear-id]` element transitions from its SSR `opacity:0.001 / translateY(20px)` initial state to rest (Framer spring approximated; hard safety-net guarantees content is never left hidden) |
| **Marquees** (Photography 2 rows, AI 1 row) | items cloned for a seamless loop, `requestAnimationFrame` translate at the original ~150 px/s, measured directions (row 1 →, row 2 ←, AI ←), paused off-screen |
| **Thumbnail videos** (home) | GIF poster at rest; hover plays the mp4 and reveals the blurred caption overlay |
| **Showcase videos** (motion, `Video-pause`) | click-to-play: click toggles play/pause (with sound) and shows/hides the Play button |
| **Background/feature videos** | autoplay muted loop while in view |
| **In-page anchors** (index list, Back-to-top) | smooth scroll |

## Notes

- **Fidelity:** static layout, typography, colours, images, videos and responsive
  behaviour are identical to the original because the clone reuses Framer's own
  HTML + CSS + the real assets. The shim reproduces the dynamic behaviour.
- The original's Framer editor badge, analytics, and search were intentionally
  removed (they only served Framer's hosting, not the design).
- `site/assets/runtime/` keeps the original Framer JS bundle purely as an archive
  of the complete scrape; it is **not loaded** by the pages.
