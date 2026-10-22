"""The artifact's upload folder (CLAUDE.md "아티팩트는 무스타파 결투 전용"): from a build (npm run build:artifact) and the
list of files the Mustafar duel requested in it (tools/qa/artifact_files.mjs), the files to publish — those requested,
plus the page, its worker and manifests, every Mustafar asset and zone, the hashed bundles, the audio, the fonts, icons,
UI pictures and portrait; the web-font formats and scripts the game never shows left out. Copies them into `out`.

    python3 tools/qa/artifact_set.py <build_dir> <requested.json> <out_dir>
"""
import json
import os
import re
import shutil
import sys

build, requested, out = sys.argv[1:4]
req = [x for x in json.load(open(requested)) if not x.startswith(('ttp:', 'cards/'))]  # (blob: URLs; the cards' optional pictures)
keep = set(req) | {'index.html', 'sw.js', 'asset-manifest.json', 'manifest.webmanifest'}
for d in ['icons', 'fonts', 'ui', 'portrait', 'audio', 'assets/mustafar', 'maps/mustafar_v2']:
    for root, _, files in os.walk(os.path.join(build, d)):
        keep |= {os.path.relpath(os.path.join(root, f), build) for f in files}
keep |= {'assets/' + f for f in os.listdir(os.path.join(build, 'assets')) if os.path.isfile(os.path.join(build, 'assets', f))}
keep = sorted(
    k for k in keep
    if os.path.isfile(os.path.join(build, k))
    and not k.endswith(('.gitkeep', '.md'))
    and 'index.example' not in k
    and not (k.startswith('assets/') and (k.endswith('.woff') or re.search(r'(thai|vietnamese|devanagari)', k)))
)
missing = [x for x in req if not os.path.isfile(os.path.join(build, x))]
shutil.rmtree(out, ignore_errors=True)
for k in keep:
    os.makedirs(os.path.dirname(os.path.join(out, k)), exist_ok=True)
    shutil.copy2(os.path.join(build, k), os.path.join(out, k))
json.dump(keep, open(os.path.join(out, '..', os.path.basename(out.rstrip('/')) + '.files.json'), 'w'), indent=0)
print(f'{len(keep)} files, {sum(os.path.getsize(os.path.join(out, k)) for k in keep) / 1e6:.1f} MB -> {out}')
print('requested but not in the build:', missing or 'none')
