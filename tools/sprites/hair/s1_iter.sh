#!/bin/sh
# One review iteration of the Clone Wars season 1 outfit: build the outfit, put the hair on,
# render the review views and the sheet beside the reference, log the note.
#   sh tools/sprites/hair/s1_iter.sh N "what changed"
set -e
N=$1
NOTE=$2
PY=.bvenv/bin/python
D=renders/cw_s1_iter_$N
mkdir -p $D
$PY tools/sprites/build_anakin.py tools/sprites/anakin_anims.json tools/sprites/out/anakin_cw_s1_base.glb cw_s1 2>&1 | grep '^exported'
$PY tools/sprites/hair/hair_v2.py tools/sprites/out/anakin_cw_s1_base.glb tools/sprites/out/anakin_cw_s1.glb tools/sprites/hair/hair_cw_s1_params.json tools/sprites/out/anakin_cw_s1_hair_backup.blend 2>&1 | grep '^HAIR new'
$PY tools/sprites/hair/hair_review.py tools/sprites/out/anakin_cw_s1.glb $D cw_s1 - body 2>&1 | grep REVIEW
cp tools/sprites/hair/hair_cw_s1_params.json $D/params.json
python3 tools/sprites/hair/s1_sheet.py $D cw_s1 "iter $N: $NOTE"
printf '## iter %s\n%s\n\n' "$N" "$NOTE" >> renders/cw_s1_notes.md
