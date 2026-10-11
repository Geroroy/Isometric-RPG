#!/bin/sh
# One review iteration for an outfit: build the hair from the current parameters, render the
# outfit with its current hair curves (old) and with the new hair, lay out the comparison.
#   sh tools/sprites/hair/hair_iter.sh N OUTFIT "note"      (OUTFIT: tunic | robe)
set -e
N=$1
O=$2
D=renders/hair_iter_$N
mkdir -p "$D"
cp tools/sprites/hair/hair_v2_params.json "$D/params.json"
.bvenv/bin/python tools/sprites/hair/hair_v2.py tools/sprites/out/anakin_$O.glb tools/sprites/out/anakin_${O}_hairv2.glb 2>&1 | grep HAIR | tee "$D/build_$O.txt"
OLD=renders/hair_old_$O
if [ ! -f "$OLD/old_${O}_iso_back.png" ]; then
  .bvenv/bin/python tools/sprites/hair/hair_review.py tools/sprites/out/anakin_$O.glb "$OLD" old_$O tools/sprites/out/anakin_hair.blend 2>&1 | grep REVIEW
fi
cp "$OLD"/old_${O}_*.png "$D/"
.bvenv/bin/python tools/sprites/hair/hair_review.py tools/sprites/out/anakin_${O}_hairv2.glb "$D" new_$O 2>&1 | grep REVIEW
python3 tools/sprites/hair/hair_sheet.py "$D" old_$O new_$O "$D/compare_$O.png" "iteration $N ($O): $3"
