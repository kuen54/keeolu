#!/usr/bin/env python3
"""Convert the standalone grid GIFs to muted autoplay-loop MP4 + a small first-frame
poster. GIFs on this site are all decorative grid tiles (verified: none sit inside a
click-to-play Video-pause component or a marquee ticker), so an autoplay/muted/loop
<video> is a pixel-equivalent, far lighter replacement — and the shim pauses it when
off-screen, which a GIF can't do.

Referenced GIF ids are discovered from the raw Framer HTML so this stays in sync with
what the pages actually use. Output:
  site/assets/videos/<id>.mp4          H.264, yuv420p, faststart, no audio, crf 28
  site/assets/images/<id>.poster.jpg   first frame, <=640px wide
localize.py rewrites <img *.gif> -> <video> for every id that has an .mp4 here.
"""
import re, os, glob, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

bases = set()
for f in glob.glob('*.raw.html'):
    h = open(f, encoding='utf-8').read()
    for m in re.finditer(r'framerusercontent\.com/images/([A-Za-z0-9]+)\.gif', h):
        bases.add(m.group(1))

os.makedirs('site/assets/videos', exist_ok=True)
print(f'{len(bases)} referenced GIF ids')
tot_gif = tot_mp4 = 0
for base in sorted(bases):
    src = f'site/assets/images/{base}.gif'
    if not os.path.exists(src):
        print('  MISSING', src); continue
    mp4 = f'site/assets/videos/{base}.mp4'
    poster = f'site/assets/images/{base}.poster.jpg'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src,
        '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-an',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', mp4], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-frames:v', '1',
        '-vf', "scale='min(640,iw)':-2", '-q:v', '6', poster], check=True)
    g = os.path.getsize(src); v = os.path.getsize(mp4); p = os.path.getsize(poster)
    # a few tiny GIFs transcode LARGER than the original (H.264 keyframe overhead) —
    # not worth it, drop the outputs so localize.py leaves them as (lazy-loaded) GIFs
    if v + p >= g * 0.8:
        os.remove(mp4); os.remove(poster)
        print(f'  {base}: {g//1024}KB gif -> {(v+p)//1024}KB (skipped, not smaller)')
        continue
    tot_gif += g; tot_mp4 += v + p
    print(f'  {base}: {g//1024}KB gif -> {v//1024}KB mp4 + {p//1024}KB poster')
print(f'TOTAL: {tot_gif//1024//1024}MB gif -> {tot_mp4//1024//1024}MB mp4+poster')
