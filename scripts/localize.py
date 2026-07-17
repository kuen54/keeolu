#!/usr/bin/env python3
"""Turn each raw Framer HTML page into a self-contained local page:
 - rewrite every remote framerusercontent/framer URL -> local downloaded path
 - rewrite internal ./page links -> flat page.html
 - strip Framer's CDN React bundle, analytics, editor, nav/querystring inline
   scripts and modulepreloads
 - KEEP only Framer's inline responsive-sizes fixer; strip its React bundle,
   analytics, editor, module preloads AND its `animator` engine (the animator
   never advances without React, so framer-shim.js reproduces the reveal instead)
 - inject our vanilla shim (appear/scroll reveal + marquee + video + icons)
"""
import re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# remote -> local, longest remote first so ?query variants replace before bare
mapping = []
with open('urls.tsv') as f:
    for line in f:
        line = line.rstrip('\n')
        if '\t' in line:
            u, rel = line.split('\t', 1)
            mapping.append((u, rel))
mapping.sort(key=lambda x: -len(x[0]))

PAGES = {
    'home.raw.html': 'index.html',
    'page-motion.raw.html': 'motion.html',
    'page-graphic.raw.html': 'graphic.html',
    'page-3d-fashion.raw.html': '3d-fashion.html',
    'page-photography.raw.html': 'photography.html',
    'page-tangibles.raw.html': 'tangibles.html',
}
ROUTES = ['motion', 'graphic', '3d-fashion', 'photography', 'tangibles']

def rewrite_assets(html):
    for u, rel in mapping:
        if u in html:
            html = html.replace(u, rel)
    return html

# ids of GIFs that were transcoded by convert_gifs.py. The signature is a first-frame
# poster jpg in images/ (grid GIFs get an mp4 too; poster-only GIFs — used just as a
# <video poster> — get only the jpg once their unused mp4 is pruned). Keying on the
# poster alone keeps the build idempotent across reruns.
_CONVERTED_GIFS = {
    f[:-len('.poster.jpg')]
    for f in os.listdir('site/assets/images')
    if f.endswith('.poster.jpg')
} if os.path.isdir('site/assets/images') else set()

def rewrite_gifs(html):
    """Swap each standalone grid <img *.gif> for a muted autoplay-loop <video> of the
    transcoded MP4 (same box: width/height attrs + object-fit style carried over, a
    small first-frame poster shown until it plays). The shim treats these exactly like
    Framer's background clips — in-view autoplay, paused off-screen."""
    def repl(m):
        tag = m.group(0)
        sm = re.search(r'src="assets/images/([A-Za-z0-9]+)(?:\.scale-down-to-\d+)?\.gif"', tag)
        if not sm:
            return tag
        base = sm.group(1)
        # only swap to <video> when the transcoded mp4 actually exists (poster-only
        # GIFs have a poster but no mp4 — they're never <img>, so this rarely triggers)
        if base not in _CONVERTED_GIFS or not os.path.exists(f'site/assets/videos/{base}.mp4'):
            return tag
        wh = ''
        for attr in ('width', 'height'):
            a = re.search(r'\s%s="([^"]*)"' % attr, tag)
            if a:
                wh += ' %s="%s"' % (attr, a.group(1))
        stm = re.search(r'\sstyle="([^"]*)"', tag)
        style = (' style="%s"' % stm.group(1)) if stm else ''
        return ('<video src="assets/videos/%s.mp4" poster="assets/images/%s.poster.jpg" '
                'autoplay muted loop playsinline preload="none"%s%s></video>'
                % (base, base, wh, style))
    return re.sub(r'<img\b[^>]*?>', repl, html)

def rewrite_gif_posters(html):
    """Framer uses an animated GIF as the poster of some <video>s. Those GIFs are
    transcoded and pruned like any other, so repoint the poster at the generated
    first-frame jpg — a static poster is fine (it only shows for the instant before
    in-view autoplay / a click starts the mp4), and it drops a multi-MB animated GIF
    that was loading just to be a placeholder."""
    def repl(m):
        base = m.group(1)
        if base in _CONVERTED_GIFS:
            return 'poster="assets/images/%s.poster.jpg"' % base
        return m.group(0)
    return re.sub(r'poster="assets/images/([A-Za-z0-9]+)(?:\.scale-down-to-\d+)?\.gif"', repl, html)

def add_video_posters(html):
    """Give every posterless <video> a first-frame poster (from video_posters.py) so
    its box shows the frame instantly instead of a blank rectangle while the lazy clip
    buffers — this is the main fix for 'the page is blank at first'."""
    def repl(m):
        tag = m.group(0)
        if 'poster=' in tag:
            return tag
        sm = re.search(r'src="assets/videos/([A-Za-z0-9]+)\.mp4"', tag)
        if not sm or not os.path.exists(f'site/assets/videos/{sm.group(1)}.poster.jpg'):
            return tag
        return tag[:6] + ' poster="assets/videos/%s.poster.jpg"' % sm.group(1) + tag[6:]
    return re.sub(r'<video\b[^>]*?>', repl, html)

def lazyload_images(html):
    # defer every remaining <img> until it nears the viewport (all have explicit
    # width/height, so no layout shift). Inactive-breakpoint copies live under
    # display:none and thus never download at all.
    def repl(m):
        tag = m.group(0)
        if 'loading=' in tag:
            return tag
        return tag[:4] + ' loading="lazy"' + tag[4:]
    return re.sub(r'<img\b[^>]*?>', repl, html)

def defer_videos(html):
    # Framer SSRs every <video preload="auto"> — 142MB of eager buffering. The shim
    # plays each clip only when it scrolls into view, so metadata-only is all we need
    # (click-to-play players get their first frame back via preload="metadata" in JS).
    return html.replace(' preload="auto"', ' preload="none"')

SITE_URL = 'https://keeolu.pages.dev'

def rewrite_head_urls(html):
    # point canonical / og:url / alternate at the deploy domain (was keeolu.com),
    # and make the social-preview images absolute (crawlers can't resolve relative)
    html = html.replace('https://keeolu.com', SITE_URL)
    html = re.sub(
        r'(<meta (?:property|name)="(?:og:image|twitter:image)" content=")assets/',
        lambda m: m.group(1) + SITE_URL + '/assets/', html)
    return html

def rewrite_links(html):
    # ./route#hash or ./route  -> route.html(#hash)
    for r in ROUTES:
        html = html.replace(f'"./{r}#', f'"{r}.html#')
        html = html.replace(f'"./{r}"', f'"{r}.html"')
    # home variants: ./#hash -> index.html#hash ; bare ./ -> index.html
    html = html.replace('"./#', '"index.html#')
    html = re.sub(r'"\./"', '"index.html"', html)
    return html

def strip_framer_runtime(html):
    # analytics loader
    html = re.sub(r'<script async src="https://events\.framer\.com/script[^>]*></script>', '', html)
    # preconnect / dns-prefetch to framer infra (optional cosmetic)
    html = re.sub(r'<link rel="(?:preconnect|dns-prefetch)"[^>]*framer[^>]*>', '', html)
    # modulepreloads (CDN mjs)
    html = re.sub(r'<link rel="modulepreload"[^>]*>', '', html)
    # main module bundle
    html = re.sub(r'<script type="module"[^>]*data-framer-bundle="main"[^>]*></script>', '', html)
    # the appear-animation caller (needs Framer's React-driven animator to tick;
    # our shim reproduces the entrance instead)
    html = re.sub(r'<script data-framer-appear-animation="no-preference">.*?</script>', '', html, flags=re.S)
    # attribute-less inline scripts: keep ONLY the responsive-sizes fixer.
    # (Framer's inline `animator` engine does not advance without the React
    #  scheduler, so it would leave elements stuck at opacity:0 — drop it and let
    #  framer-shim.js perform the exact fade-up reveal.)
    def _keep(m):
        body = m.group(1)
        if 'data-framer-original-sizes' in body:
            return m.group(0)
        return ''
    html = re.sub(r'<script>(.*?)</script>', _keep, html, flags=re.S)
    return html

# Always-on "reveal by default". Framer ships the fade-up wrappers at opacity:0, so
# the browser paints NOTHING until framer-shim.js runs — i.e. a blank page for the
# whole time the (big) HTML streams over the network. Revealing them by default lets
# the page paint progressively as it downloads; the shim then re-hides only the
# BELOW-the-fold blocks (off-screen, so no visible flash) and fades them up on scroll,
# preserving the entrance while making the first view instant. Doubles as the no-JS
# fallback. `:not(ul)` leaves the marquee tracks (translate, no opacity:0) untouched;
# blurred hover-caption overlays are excluded so they stay hidden.
# NB: Framer emits both compact (`opacity:0;`) and spaced (`opacity: 0;`) inline
# styles — cover both, or spaced wrappers (e.g. the click-to-play showcases) never
# progressive-paint. The shim also JS-reveals above-fold as a robust backstop.
_REVEAL_CSS = (
    '<style>'
    '[style*="opacity:0;"][style*="translate"]:not([style*="blur"]):not(ul),'
    '[style*="opacity: 0;"][style*="translate"]:not([style*="blur"]):not(ul),'
    '[style*="opacity:0.001"]:not(ul),'
    'section[style*="opacity:0;"],section[style*="opacity: 0;"]'
    '{opacity:1!important;transform:none!important}'
    '</style>'
)
def inject_reveal_css(html):
    return html.replace('</head>', _REVEAL_CSS + '</head>', 1)

def inject_shim(html):
    tag = '<link rel="stylesheet" href="assets/shim.css">\n<script src="assets/framer-shim.js" defer></script>\n</body>'
    return html.replace('</body>', tag, 1)

report = {}
for src, dst in PAGES.items():
    html = open(src, encoding='utf-8').read()
    html = rewrite_assets(html)
    html = rewrite_gifs(html)      # standalone <img *.gif> -> muted autoplay <video>
    html = rewrite_gif_posters(html)  # <video poster="*.gif"> -> transcoded first-frame jpg
    html = add_video_posters(html)    # posterless <video> -> first-frame jpg (no blank box)
    html = lazyload_images(html)   # remaining <img> -> loading="lazy"
    html = defer_videos(html)      # Framer <video preload="auto"> -> "none"
    html = rewrite_head_urls(html)
    html = rewrite_links(html)
    html = strip_framer_runtime(html)
    html = inject_reveal_css(html)  # reveal fade-ups by default (progressive paint)
    html = inject_shim(html)   # icons are injected at runtime by framer-shim.js
    open(os.path.join('site', dst), 'w', encoding='utf-8').write(html)
    # remaining remote refs?
    remain = re.findall(r'https://framerusercontent\.com/[^\s"\'\\)>]+', html)
    remain += re.findall(r'https://framer\.com/[^\s"\'\\)>]+', html)
    report[dst] = (len(html), sorted(set(remain)))
    print(f'{dst}: {len(html)} bytes, {len(set(remain))} remaining remote refs')

for dst,(n,remain) in report.items():
    if remain:
        print(f'\n!! {dst} still references:')
        for r in remain[:30]:
            print('   ', r)

# Prune GIF-related files the built pages no longer reference: the transcoded source
# GIFs (~110MB), plus any gif-derived mp4/poster that ended up unused (e.g. GIFs that
# were only a <video poster>, so their generated .mp4 is never linked). Only ever
# touches gif-related artifacts — original Framer assets are left alone. Idempotent;
# originals remain recoverable via git history / download.py for a re-encode.
import glob
referenced = set()
for dst in PAGES.values():
    h = open(os.path.join('site', dst), encoding='utf-8').read()
    referenced.update(re.findall(r'assets/[\w./\-]+?\.(?:mp4|jpe?g|png|gif|webp|woff2?|css|js|json)', h))

def _is_gif_artifact(path):
    if path.endswith('.gif') or path.endswith('.poster.jpg'):
        return True                                   # a source GIF or a generated poster
    if path.endswith('.mp4'):                          # gif-derived mp4s have a poster sibling
        return os.path.exists(path.replace('/videos/', '/images/')[:-4] + '.poster.jpg')
    return False

freed = removed = 0
for path in (glob.glob('site/assets/images/*.gif')
             + glob.glob('site/assets/images/*.poster.jpg')
             + glob.glob('site/assets/videos/*.mp4')):
    if path[len('site/'):] in referenced or not _is_gif_artifact(path):
        continue
    freed += os.path.getsize(path); os.remove(path); removed += 1
if removed:
    print(f'\npruned {removed} unreferenced gif-derived files ({freed//1024//1024}MB freed)')
