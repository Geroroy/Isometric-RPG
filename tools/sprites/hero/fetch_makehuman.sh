#!/bin/sh
# MakeHuman 1.1 base data (base mesh + skeleton + weights, macro/face targets, skins, eyes, eyebrows, eyelashes,
# hair, beard proxies) as the npm package makehuman-data@0.0.2 (three.js JSON conversion). Not committed: unpacked
# into tools/sprites/out/makehuman-data (gitignored). License notes: docs/CHARACTERS.md "출처와 라이선스".
set -e
cd "$(dirname "$0")/../out" 2>/dev/null || { mkdir -p "$(dirname "$0")/../out"; cd "$(dirname "$0")/../out"; }
if [ -f makehuman-data/public/data/models/human_full_size.json ]; then echo "makehuman-data: present"; exit 0; fi
tgz=$(npm pack makehuman-data@0.0.2 --silent)
mkdir -p makehuman-data && tar xzf "$tgz" -C makehuman-data --strip-components=1 && rm "$tgz"
echo "makehuman-data: unpacked to $(pwd)/makehuman-data"
