#!/usr/bin/env python3
import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
REFERER = "https://daily-start-813434.framer.app/"

jobs = []
with open('urls.tsv') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line or '\t' not in line:
            continue
        url, rel = line.split('\t', 1)
        jobs.append((url, os.path.join('site', rel)))

ok = fail = skip = 0
fails = []

def dl(job):
    global ok, fail, skip
    url, out = job
    if os.path.exists(out) and os.path.getsize(out) > 20:
        skip += 1
        return
    os.makedirs(os.path.dirname(out), exist_ok=True)
    r = subprocess.run(['curl', '-sL', '--retry', '3', '--retry-delay', '1',
                        '-A', UA, '-H', f'Referer: {REFERER}',
                        '-o', out, '-w', '%{http_code}', url],
                       capture_output=True, text=True)
    code = r.stdout.strip()
    sz = os.path.getsize(out) if os.path.exists(out) else 0
    if code == '200' and sz > 20:
        ok += 1
    else:
        fail += 1
        fails.append(f'{code} {sz} {url}')
        if os.path.exists(out):
            os.remove(out)

with ThreadPoolExecutor(max_workers=12) as ex:
    list(ex.map(dl, jobs))

print(f'ok={ok} skip={skip} fail={fail} total={len(jobs)}')
if fails:
    print('--- FAILURES ---')
    print('\n'.join(fails))
# summary
subprocess.run('find site/assets -type f | wc -l', shell=True)
subprocess.run('du -sh site/assets/* 2>/dev/null', shell=True)
