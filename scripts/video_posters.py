#!/usr/bin/env python3
"""Generate a small first-frame poster for every referenced <video> that lacks one.
Framer shipped these videos with no poster and relied on preload="auto" to paint the
first frame — but we set preload="none" (lazy), so without a poster the video area is
blank until it buffers. A lightweight first-frame jpg fixes that: the frame shows
instantly, the clip streams in on view/click. Output: site/assets/videos/<id>.poster.jpg
localize.py's add_video_posters() wires them onto the <video> tags."""
import re, os, glob, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# referenced video ids that currently have NO poster attribute
need = set()
for f in glob.glob('site/*.html'):
    h = open(f, encoding='utf-8').read()
    for vt in re.findall(r'<video[^>]*>', h):
        m = re.search(r'src="assets/videos/([A-Za-z0-9]+)\.mp4"', vt)
        if m and 'poster=' not in vt:
            need.add(m.group(1))

print(f'{len(need)} videos need a poster')
made = 0
for vid in sorted(need):
    mp4 = f'site/assets/videos/{vid}.mp4'
    poster = f'site/assets/videos/{vid}.poster.jpg'
    if not os.path.exists(mp4):
        print('  MISSING mp4', vid); continue
    if os.path.exists(poster):
        made += 1; continue
    # first frame, capped at 720px wide, moderate quality (~10-25KB)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp4, '-frames:v', '1',
        '-vf', "scale='min(720,iw)':-2", '-q:v', '6', poster], check=True)
    made += 1
    print(f'  {vid}: {os.path.getsize(poster)//1024}KB')
print(f'{made} posters ready')
