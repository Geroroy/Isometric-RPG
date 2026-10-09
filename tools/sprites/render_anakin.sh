#!/usr/bin/env bash
# Render Anakin's sprite sheet without opening a Blender window.
#   tools/sprites/render_anakin.sh [eevee|cycles] [extra render_sprites.py options…]
# Uses the bpy module in .bvenv when it is there, else the Blender app in
# background mode (blender -b). EEVEE needs a GPU (or Mesa's software EGL,
# which is slower than Cycles); on a machine without one, use cycles.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENGINE="${1:-eevee}"
shift || true
ARGS=(tools/sprites/out/anakin.glb public/sprites --engine "$ENGINE" --meta tools/sprites/anakin_anims.json "$@")
start=$(date +%s)
if [ -x .bvenv/bin/python ]; then
  .bvenv/bin/python tools/sprites/render_sprites.py "${ARGS[@]}"
else
  blender -b --factory-startup -P tools/sprites/render_sprites.py -- "${ARGS[@]}"
fi
echo "done in $(( $(date +%s) - start )) s"
