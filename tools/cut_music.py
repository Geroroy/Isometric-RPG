#!/usr/bin/env python3
"""Cut the game's background music.

    python3 tools/cut_music.py "Anakin Skywalker Theme Complete.m4a"
    python3 tools/cut_music.py --mustafar PATH HEROES AVO PADME
    (both together: the compilation first, then --mustafar and its four files)

The first source is the fan compilation "Anakin Skywalker Theme Complete"
(Rey Skywalker, 22:13, with chapter markers). Each clip below is a span of it
assigned to a game situation; clips get short fades and are encoded as Opus
(.webm, plays in every current browser) into public/audio/music/. The script then
writes the "music" section of public/audio/index.json, keeping everything
else there. Needs ffmpeg.

--mustafar takes the Movie Duel's scene-by-scene score, music only (no film
dialogue): PATH = "A Path I Can't Follow" (The Ghost Critic), HEROES = John
Williams "Battle of the Heroes", AVO = John Williams "Anakin vs. Obi-Wan",
PADME = "Padmé's Ruminations" (The Ghost Critic). Which span plays over which
scene, and why, is the cue sheet in docs/MUSTAFAR_SCORE.md; the clip ends
here carry a 1.5-2 s tail past their scene so the crossfade into the next one
has music under it. The duel's clock (src/game/duelMustafar.js SCORE) maps
its film time onto these clips.

Edit CLIPS / MUSTAFAR to re-assign situations or move the cut points.
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

# the Movie Duel's score (docs/MUSTAFAR_SCORE.md): situation -> [(file, source, start s, end s, title)]
MUSTAFAR = {
    'mustafarIntro': [('mustafar_path', 'path', 0, 72.9, "A Path I Can't Follow — the landing platform")],
    'mustafarA': [('mustafar_heroes_1', 'heroes', 30, 180, 'Battle of the Heroes — the facility')],
    'mustafarB': [('mustafar_avo_1', 'avo', 24, 189, 'Anakin vs. Obi-Wan — shields down')],
    'mustafarC': [('mustafar_heroes_2', 'heroes', 184, 224.6, 'Battle of the Heroes — "I have failed you"')],
    'mustafarD': [('mustafar_avo_2', 'avo', 187, 227, 'Anakin vs. Obi-Wan — the lava river')],
    'mustafarEnd': [('mustafar_padme', 'padme', 0, 86, "Padmé's Ruminations — the high ground")],
}
MUSTAFAR_SOURCES = ['path', 'heroes', 'avo', 'padme']
RETIRED = ['mustafar']  # the old voiced film edit's situation (its files are deleted)


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    sources = []  # (table, {source name: file})
    if '--mustafar' in args:
        i = args.index('--mustafar')
        files = args[i + 1:i + 5]
        if len(files) != 4:
            sys.exit('--mustafar needs four files: PATH HEROES AVO PADME')
        sources.append((MUSTAFAR, dict(zip(MUSTAFAR_SOURCES, files))))
        args = args[:i] + args[i + 5:]
    if args:
        sources.insert(0, (CLIPS, None, args[0]))
    root = Path(__file__).resolve().parent.parent
    out = root / 'public/audio/music'
    out.mkdir(parents=True, exist_ok=True)
    index = root / 'public/audio/index.json'
    data = json.loads(index.read_text()) if index.exists() else {}
    manifest = data.get('music', {})
    for entry in sources:
        table = entry[0]
        if table is MUSTAFAR:
            for k in RETIRED:
                manifest.pop(k, None)
        for situation, clips in table.items():
            manifest[situation] = []
            for clip in clips:
                if table is MUSTAFAR:
                    name, which, a, b, title = clip
                    src = entry[1][which]
                else:
                    name, a, b, title = clip
                    src = entry[2]
                dur = round(b - a, 3)
                dst = out / f'{name}.webm'
                fade = f'afade=t=in:d={FADE_IN},afade=t=out:st={dur - FADE_OUT}:d={FADE_OUT}'
                subprocess.run(
                    ['ffmpeg', '-v', 'error', '-y', '-ss', str(a), '-t', str(dur), '-i', src,
                     '-vn', '-af', fade, '-c:a', 'libopus', '-b:a', BITRATE, str(dst)],
                    check=True,
                )
                manifest[situation].append({'file': f'music/{name}.webm', 'title': title})
                mm = lambda t: f'{int(t) // 60}:{t % 60:04.1f}'
                print(f'  {dst.name:20} {mm(a)}-{mm(b)}  {title}')
    data['music'] = manifest
    index.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'  {index} updated')


if __name__ == '__main__':
    main()
