#!/usr/bin/env python3
"""Extract every unique framerusercontent/framer asset URL (with query) from all
raw HTML pages, compute a filesystem-safe local path for each, and emit:
  - urls.tsv  : <remote_url>\t<local_relpath>
Local path scheme (keeps a valid extension so static servers set MIME right):
  /images/NAME.png?scale-down-to=1024  ->  assets/images/NAME.scale-down-to-1024.png
  /assets/NAME.mp4                     ->  assets/videos/NAME.mp4
  /assets/NAME.woff2                   ->  assets/fonts/NAME.woff2
  /third-party-assets/fontshare/.../X.woff2 -> assets/fonts/fontshare-<hash>.woff2
  /sites/<id>/NAME.mjs                 ->  assets/runtime/NAME.mjs
  /sites/<id>/searchIndex-*.json       ->  assets/runtime/searchIndex.json
  framer.com/m/... and /modules/...    ->  assets/runtime/<basename>
"""
import re, glob, os, sys, hashlib

pages = ['home.raw.html'] + sorted(glob.glob('page-*.raw.html'))
url_re = re.compile(r'https://(?:framerusercontent\.com|framer\.com|events\.framer\.com)/[^\s"\'\\)<>]+')

def local_for(url):
    # strip protocol+host
    m = re.match(r'https://([^/]+)(/.*)$', url)
    host, path = m.group(1), m.group(2)
    query = ''
    if '?' in path:
        path, query = path.split('?', 1)
    base = os.path.basename(path)
    name, ext = os.path.splitext(base)
    # query -> safe suffix inserted before extension
    qsuf = ''
    if query:
        qsuf = '.' + re.sub(r'[^A-Za-z0-9]+', '-', query).strip('-')
    if '/images/' in path:
        return f'assets/images/{name}{qsuf}{ext}'
    if path.startswith('/assets/') and ext.lower() == '.mp4':
        return f'assets/videos/{name}{qsuf}{ext}'
    if ext.lower() in ('.woff2', '.woff', '.ttf', '.otf'):
        return f'assets/fonts/{name}{qsuf}{ext}'
    if 'fontshare' in path:
        h = hashlib.md5(path.encode()).hexdigest()[:10]
        return f'assets/fonts/fontshare-{h}.woff2'
    if path.startswith('/assets/'):  # non-mp4 asset (e.g. a png in /assets/)
        return f'assets/media/{name}{qsuf}{ext}'
    if '/sites/' in path and ext == '.mjs':
        return f'assets/runtime/{base}'
    if '/sites/' in path and ext == '.json':
        return f'assets/runtime/searchIndex.json'
    if '/modules/' in path:
        return f'assets/runtime/{base}'
    # fallback
    h = hashlib.md5(url.encode()).hexdigest()[:10]
    return f'assets/other/{h}-{base or "file"}'

seen = {}
for p in pages:
    html = open(p, encoding='utf-8').read()
    for u in url_re.findall(html):
        # skip analytics + editor
        if u.startswith('https://events.framer.com'):
            continue
        if u in seen:
            continue
        seen[u] = local_for(u)

with open('urls.tsv', 'w') as f:
    for u, l in sorted(seen.items()):
        f.write(f'{u}\t{l}\n')
print(f'{len(seen)} unique URLs -> urls.tsv')
# quick breakdown
from collections import Counter
c = Counter(l.split('/')[1] for l in seen.values())
print('by folder:', dict(c))
