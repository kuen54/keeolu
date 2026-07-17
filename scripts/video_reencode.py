#!/usr/bin/env python3
"""Re-encode the original Framer videos to a sane weight. They ship at absurd bitrates
(600x800 muted loops at 8+ Mbps) and a few at 4K/2500px — the dominant cause of slow
loading (80-150MB pulled per page while scrolling) AND scroll jank (decoding fat frames
on a Retina display). Re-encode H.264 CRF 26, cap the long side at 1600px, keep audio
(click-to-play showcases have sound). Replace in place only when meaningfully smaller;
gif-derived clips (already tiny) and anything that wouldn't shrink are left alone.
Posters/HTML paths are unchanged. Originals stay recoverable via git."""
import os, glob, subprocess, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

vids = [f for f in glob.glob('site/assets/videos/*.mp4')]
print(f'{len(vids)} mp4 files')
tot_before = tot_after = 0
reencoded = skipped = 0
for f in sorted(vids):
    sz = os.path.getsize(f)
    tot_before += sz
    if sz < 1_000_000:                 # already small (e.g. gif-derived) — leave it
        tot_after += sz; skipped += 1; continue
    tmp = f + '.tmp.mp4'
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f,
        '-vf', 'scale=w=1600:h=1600:force_original_aspect_ratio=decrease:force_divisible_by=2',
        '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', tmp])
    if r.returncode != 0 or not os.path.exists(tmp):
        print('  FAIL', os.path.basename(f)); tot_after += sz; skipped += 1
        if os.path.exists(tmp): os.remove(tmp)
        continue
    nsz = os.path.getsize(tmp)
    if nsz < sz * 0.85:                # only keep if it actually saves >=15%
        os.replace(tmp, f)
        tot_after += nsz; reencoded += 1
        print(f'  {os.path.basename(f)[:24]}: {sz//1024}KB -> {nsz//1024}KB')
    else:
        os.remove(tmp); tot_after += sz; skipped += 1

print(f'\nre-encoded {reencoded}, left {skipped} as-is')
print(f'TOTAL video: {tot_before//1024//1024}MB -> {tot_after//1024//1024}MB')
