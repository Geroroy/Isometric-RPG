// The undercity as text (docs/UNDERCITY_MAP.md): one character per tile of the lower level from
// the live world — ground kind, blocked tiles, props, landmarks — plus a reachability check
// from the turbolift landing to every landmark and a count of walkable tiles per zone.
//   node tools/qa/undercity_ascii.mjs [url] > docs/undercity_ascii.txt
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(800);
const out = await page.evaluate(async () => {
  const U = window.__undercity || null; // the layout data (exposed by worldgen for QA)
  const g = __game;
  const w = g.places.hub.world;
  const W = w.w;
  const [x0, y0, x1, y1] = [56, 92, 140, 136];
  const B = { 11: 'U', 12: '.', 13: ' ', 14: ':', 15: '~', 16: 'w', 17: ',' };
  const rows = [];
  const marks = new Map();
  const mark = (x, y, c) => marks.set(`${Math.floor(x)},${Math.floor(y)}`, c);
  const SYM = { tenement0: 'T', tenement1: 'T', tenement2: 'T', cantina: 'C', billboard: 'H', speeder0: 's', speeder1: 's', crates: 'c', barrels: 'b', trashBin: 't', droidParts: 'd', junctionBox: 'j', ventGrate: 'v', seatsA: '=', seatsB: '=',
    aptModuleA: 'A', aptStackB: 'A', aptBalconyC: 'A', aptModuleC: 'A', buildingBlock: 'B', denseMarket: 'B', pawnShop: 'B', pawnShopE: 'B', marketStall: 'F', tradeKiosk: 'F',
    ramenStand: 'F', skewerCart: 'F', skewerCartB: 'F', dumplingStall: 'F', blueMilkStand: 'F', groguWagon: 'F', verticalPipes: '|', conduitBundle: '-', steamVent: 'V', ventStack: 'V',
    crateStack: 'c', crateBarrels: 'c', barrelPile: 'b', scrapHeap: 'd', tradeTerminal: '$', trashCompactor: 'K', compactorUnit: 'K', conduitArray: 'j', lightPost: 'i', lightPostHolo: 'i',
    abandonedSpeeder: 's', speederBike: 's', neonSignSet: 'n', barSign: 'n', signPost: 'n' };
  const MSYM = { turbolift: 'L', trashPile: ',' };
  const B2 = { 11: 'U', 12: '.', 13: ' ', 14: ':', 15: '~', 16: 'w', 17: ',' };
  for (const p of w.props) mark(p.x, p.y, p.type === 'sheet' ? SYM[p.sheet] || 'F' : MSYM[p.type] || '?');
  for (let y = y0; y < y1; y++) {
    let line = '';
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const m = marks.get(`${x},${y}`);
      const bl = w.blocked[i];
      let c = B[w.biome[i]] ?? '?';
      if (m) c = m;
      else if (bl === 1) c = '#';
      line += c;
    }
    rows.push(String(y).padStart(3) + ' ' + line);
  }
  // reachability by BFS over free tiles from the lift landing
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < w.h && !w.blocked[y * W + x];
  const seen = new Uint8Array(W * w.h);
  const q = [[83, 100]];
  seen[100 * W + 83] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (free(nx, ny) && !seen[ny * W + nx]) {
        seen[ny * W + nx] = 1;
        q.push([nx, ny]);
      }
    }
  }
  const at = (x, y) => !!seen[Math.floor(y) * W + Math.floor(x)];
  const reach = {};
  if (U) {
    const P = U.points;
    reach.plazaCentre = at(...P.plazaCentre);
    reach.cantinaDoor = at(...P.cantinaDoor);
    reach.overlook = at(...P.overlook);
    reach.westDeadEnd = at(...P.deadEnds.westAlley);
    reach.workshopDeadEnd = at(...P.deadEnds.workshopAlley);
    reach.ventSE = at(130, 120);
    reach.ventSW = at(63, 127);
    reach.court = at(74, 127);
    for (const [name, spots] of Object.entries(U.points)) if (name === 'foodStallCluster') reach.stallFronts = spots.map(([x, y]) => at(x, y + 1.6) || at(x + 1.6, y) || at(x - 1.6, y) || at(x, y - 1.6));
  }
  const life = window.__cityLife || null;
  const lifeBad = [];
  if (life) {
    for (const [k, pl] of Object.entries(life.places)) {
      const pts = Array.isArray(pl.at[0]) ? pl.at : [pl.at];
      for (const [x, y] of pts) if (y > 90 && !at(x, y)) lifeBad.push(`${k} ${x},${y}`);
    }
    for (const pt of life.patrols) if (pt.level === 'low') for (const [x, y] of pt.route) if (!at(x, y)) lifeBad.push(`patrol ${x},${y}`);
  }
  const npcs = g.units.filter((u) => u.kind === 'npc' || u.name).filter((u) => u.y > 90).map((u) => `${u.name || u.kind} ${u.x},${u.y} ${at(u.x, u.y)}`);
  let walk = 0;
  for (let y = 94; y < 134; y++) for (let x = 58; x < 139; x++) if (seen[y * W + x]) walk++;
  return { rows, reach, lifeBad, npcs, walk, props: w.props.length, lightsLow: w.lights.filter((l) => l.y > 90).length, steam: (w.steam || []).length };
});
console.log('    ' + Array.from({ length: 84 }, (_, i) => (i % 10 === 0 ? String(Math.floor((56 + i) / 10) % 10) : ' ')).join(''));
console.log('    ' + Array.from({ length: 84 }, (_, i) => String((56 + i) % 10)).join(''));
for (const r of out.rows) console.log(r);
console.log('legend: U upper plaza  . metal plate  : plaza (grated plates)  ~ mud  w sump  , dirt  (blank) chasm  # blocked  A apartment module  B shop / block building  F food stall / kiosk  $ trade terminal  L lift  | pipe stack  - conduit bundle (walk over)  V steam vent / stack  K compactor  i light post  n neon sign  s speeder  c crates  b barrels  d scrap heap  j conduit array');
console.log(JSON.stringify({ reach: out.reach, lifeBad: out.lifeBad, npcs: out.npcs, walkable: out.walk, props: out.props, lightsLow: out.lightsLow, steam: out.steam }, null, 1));
await browser.close();
