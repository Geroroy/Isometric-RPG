#!/usr/bin/env python3
"""Cut the game's background music out of an Anakin theme compilation.

    python3 tools/cut_music.py "Anakin Skywalker Theme Complete.m4a"

The source is the fan compilation "Anakin Skywalker Theme Complete"
(Rey Skywalker, 22:13, with chapter markers). Each clip below is a span of it
assigned to a game situation; clips get short fades and are encoded as Opus
(.webm, plays in every current browser) into public/audio/music/. The script then
writes the "music" section of public/audio/index.json, keeping everything
else there. Needs ffmpeg.

Edit CLIPS to re-assign situations or move the cut points.
"""

import json
import subprocess
import sys
from pathlib import Path

BITRATE = '64k'
FADE_IN = 0.4
FADE_OUT = 1.5

# situation -> list of (file name, start s, end s, chapter title)
CLIPS = {
    'title': [('title', 549, 682, "Anakin's Dark Deeds")],
    'explore': [
        ('explore_1', 320, 549, "Anakin's Dark Deeds (Lucas King)"),
        ('explore_2', 1218, 1318, "Anakin's Dark Deeds"),
    ],
    'base': [
        ('base_1', 242, 285, 'The Boys Continue'),
        ('base_2', 695, 744, 'The Boys Continue'),
    ],
    'combat': [
        ('combat_1', 92, 242, 'Anakin vs Obi-Wan / Inquisitor Duel'),
        ('combat_2', 31, 76, 'Anakin vs Obi-Wan'),
    ],
    'boss': [('boss', 744, 822, "Mace Windu's Theme (Lucas King)")],
    'duel': [('duel', 822, 1040, 'Battle of the Heroes')],
    'credits': [('credits', 1040, 1204, 'A New Hope and End Credits')],
    # one-shot stings
    'victory': [('victory', 76, 92, 'Anakin Skywalker Theme (Battlefront II)')],
    'death': [('death', 302, 320, 'Anakin Sees His Future')],
    'dark': [('dark', 682, 695, 'Vader: Shards of the Past')],
}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    root = Path(__file__).resolve().parent.parent
    out = root / 'public/audio/music'
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for situation, clips in CLIPS.items():
        manifest[situation] = []
        for name, a, b, title in clips:
            dur = b - a
            dst = out / f'{name}.webm'
            fade = f'afade=t=in:d={FADE_IN},afade=t=out:st={dur - FADE_OUT}:d={FADE_OUT}'
            subprocess.run(
                ['ffmpeg', '-v', 'error', '-y', '-ss', str(a), '-t', str(dur), '-i', src,
                 '-vn', '-af', fade, '-c:a', 'libopus', '-b:a', BITRATE, str(dst)],
                check=True,
            )
            manifest[situation].append(f'music/{name}.webm')
            print(f'  {dst.name:16} {a // 60}:{a % 60:02}-{b // 60}:{b % 60:02}  {title}')
    index = root / 'public/audio/index.json'
    data = json.loads(index.read_text()) if index.exists() else {}
    data['music'] = manifest
    index.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'  {index} updated')


if __name__ == '__main__':
    main()
