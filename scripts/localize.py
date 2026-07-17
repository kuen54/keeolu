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

# ids of GIFs that were transcoded to MP4 by convert_gifs.py. The signature of a
# gif-derived video is a matching first-frame poster jpg (original Framer videos have
# none), so this works even after the source GIFs are pruned from the deploy.
_CONVERTED_GIFS = {
    os.path.splitext(f)[0]
    for f in os.listdir('site/assets/videos')
    if f.endswith('.mp4') and os.path.exists(f'site/assets/images/{os.path.splitext(f)[0]}.poster.jpg')
} if os.path.isdir('site/assets/videos') else set()

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
        if base not in _CONVERTED_GIFS:
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

# Progressive-enhancement fallback: without JS, Framer's fade-up wrappers stay at
# opacity:0 and the whole page is blank. This <noscript> rule reveals exactly what
# framer-shim.js reveals — translate-based fade-ups and the <section> ticker
# wrappers — while leaving blurred hover-caption overlays hidden.
_NOSCRIPT = (
    '<noscript><style>'
    '[style*="opacity:0;"][style*="translate"]:not([style*="blur"]),'
    '[style*="opacity:0.001"],'
    'section[style*="opacity:0;"]{opacity:1!important;transform:none!important}'
    '</style></noscript>'
)
def inject_noscript(html):
    return html.replace('</head>', _NOSCRIPT + '</head>', 1)

def inject_shim(html):
    tag = '<link rel="stylesheet" href="assets/shim.css">\n<script src="assets/framer-shim.js" defer></script>\n</body>'
    return html.replace('</body>', tag, 1)

report = {}
for src, dst in PAGES.items():
    html = open(src, encoding='utf-8').read()
    html = rewrite_assets(html)
    html = rewrite_gifs(html)      # standalone <img *.gif> -> muted autoplay <video>
    html = lazyload_images(html)   # remaining <img> -> loading="lazy"
    html = defer_videos(html)      # Framer <video preload="auto"> -> "none"
    html = rewrite_head_urls(html)
    html = rewrite_links(html)
    html = strip_framer_runtime(html)
    html = inject_noscript(html)
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

# Prune the now-unreferenced source GIFs (converted to MP4 above) from the deploy —
# no page loads them any more, they'd just be ~110MB of dead weight. Idempotent:
# a rerun finds nothing left to remove. Originals remain recoverable via git history
# / download.py if a re-encode is ever needed.
import glob
freed = removed = 0
for base in _CONVERTED_GIFS:
    for g in (glob.glob(f'site/assets/images/{base}.gif')
              + glob.glob(f'site/assets/images/{base}.scale-down-to-*.gif')):
        freed += os.path.getsize(g); os.remove(g); removed += 1
if removed:
    print(f'\npruned {removed} converted-source GIFs ({freed//1024//1024}MB freed)')
