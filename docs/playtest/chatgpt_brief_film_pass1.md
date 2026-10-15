# Playtest brief — Mustafar duel, film pass 1 (landing pad → conference room)

Game: https://claude.ai/artifact/RVWZrjCpGyYMz9HT5xMgfj (no login; runs without WebGL). You play Anakin against an
Obi-Wan AI. Controls: left click on Obi-Wan to attack, hold the right button to guard (a perfect parry is the guard
raised just before his blow lands — a closing ring warns of it), Esc skips a cutscene, number keys 1–6 are skills.

## What changed since your last report

1. The route follows the film's order: landing pad → the open connecting deck → the facility door → an interior entry
   corridor (slanted frames along its walls) → the control room → the conference room → the Force push → back into the
   same control room → the shield generator → the balcony. Before, the conference room came first.
2. Control room (film 12920): a long central table on the lower floor, consoles on the step along the wall, thick
   slanted pillars at the corridor's door. The two small round tables are gone.
3. Conference room (13142, 13148): one 12 m table between unbroken rows of high-backed chairs. Nine seconds into the
   fight there, Obi-Wan leaps onto the table and Anakin follows; the fight goes on up on the tabletop (you can step off
   at either end and back up). If either of you is on the table when the fight's mark is reached, the Force push
   happens on the tabletop.
4. The conference room is reached from the corridor by a short side passage (the film does not show this connection:
   it is our estimate).
5. Landing pad: fewer busy floor bays near the ramp and the standoff; small floor lamps with a dim light between the
   connecting deck and the standoff.

## Please check

- Each place reads as what it is without labels: interior corridor vs. open deck, control room vs. conference room.
- Doorways you can see match where you can walk (no walking through walls, no blocked-looking openings you can pass).
- After every cutscene both fighters and the way onward are on screen.
- On the table: climbing up and down at its ends, fighting on it, the push on it — anything stuck, hidden behind the
  table, or floating.
- Anything that blocks progress, any error message, anything hard to read (blades, characters against the floor).

## Shortcuts (if the link keeps its query string; otherwise play from the start and skip cutscenes with Esc)

Add `?mfPart=<part>` before `#duel-mustafar`: `pad`, `corridor`, `control`, `room` (conference room; the table scene
comes at 9 s), `control2` (the control room again), `balcony`, then the later route.

## How to report

Per issue: where (place or part), what you did, what you saw, what you expected, a screenshot if you can. Say whether
you used god mode or played normally, and which cutscenes you skipped. Note the version shown in the page if visible.

## Map editor (to propose layout fixes)

The ✎ button at the top right (or F2) opens the map editor over the running game. Modes: 1 소품 (props — drag to move,
pick one in the panel and click the map to place it, Del removes, B toggles whether it blocks, F its layer), 2 길 (the
walkable tiles: left button blocks a tile, right button opens it), 3 조명 (lights: click empty ground to add, drag to
move, the panel sets colour/radius/height). P walks the map yourself to try it (P again returns, F2 closes). Ctrl+Z
undoes. Pieces the cutscenes use (the facility door, the robes, the shield generator, the catwalk's end, the collector
arm and tower) can be moved but not deleted. The floors and walls are fixed pictures: there is no floor painting, and
pictures are not mirrored.

When you are done: 💾 저장 (Ctrl+S) keeps it in your browser, then ⬇ 파일 받기 saves `mustafar_v2_edit.json` — send
that file back with your report; it is merged into the map's source. Say what each change is for.
