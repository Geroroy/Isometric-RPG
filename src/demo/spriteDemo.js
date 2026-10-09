// Review page for the Blender sprite pipeline (not part of the game yet):
// Anakin from his sprite sheet + JSON, and three-layer building sprites
// (body, neon, floor reflection) on a wet street.
//   ?anakin=<dir>/anakin_256.json&building=<dir>/underBlock_1_512.json
// WASD / arrows or click to walk. Shows: neon drawn with 'lighter' and
// flickering per the JSON, characters and buildings sorted by their ground
// y, a building turning see-through when Anakin walks behind it, and the
// footprint polygons as collision.
const Q = new URLSearchParams(location.search);
const HALF_W = 20;
const HALF_H = 10;
const Z = 2; // screen px per game px
const iso = (x, y) => ({ x: (x - y) * HALF_W, y: (x + y) * HALF_H });
const fromIso = (sx, sy) => ({ x: (sx / HALF_W + sy / HALF_H) / 2, y: (sy / HALF_H - sx / HALF_W) / 2 });

const cv = document.getElementById('c');
const g = cv.getContext('2d');
const info = document.getElementById('info');
const resize = () => {
  cv.width = innerWidth;
  cv.height = innerHeight;
};
addEventListener('resize', resize);
resize();

const loadImg = (src) => new Promise((res, rej) => Object.assign(new Image(), { onload() { res(this); }, onerror: rej, src }));
const dirOf = (url) => url.replace(/[^/]*$/, '');

/** A character sprite set from render_sprites.py: sheet pages + JSON. */
async function loadCharacter(url) {
  const meta = await (await fetch(url)).json();
  const base = dirOf(url);
  meta.img = await Promise.all(meta.pages.map((p) => loadImg(base + p)));
  meta.shadowImg = await Promise.all(meta.shadowPages.map((p) => loadImg(base + p)));
  return meta;
}

/** A building from render_building.py: three layers + JSON. */
async function loadBuilding(url) {
  const meta = await (await fetch(url)).json();
  const base = dirOf(url);
  meta.img = {}; // the layers' images (the JSON's own `neon` holds the flicker settings)
  for (const [k, f] of Object.entries(meta.layers)) meta.img[k] = await loadImg(base + f);
  return meta;
}

/** Neon level over time: a hum plus random dropouts, from the JSON's settings. */
function neonLevel(b, t) {
  const n = b.meta.neon;
  if (b.drop && t < b.drop.until) return n.flicker.level;
  if (!b.drop || t >= b.drop.until) {
    b.drop = null;
    if (Math.random() < n.flicker.rate / 60) b.drop = { until: t + n.flicker.dur[0] + Math.random() * (n.flicker.dur[1] - n.flicker.dur[0]) };
  }
  return n.base * (1 - n.hum + n.hum * Math.sin(t * n.speed * Math.PI * 2 + b.phase));
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let target = null;
let cam = { x: 0, y: 0 };
cv.addEventListener('pointerdown', (e) => {
  const sx = (e.clientX - cv.width / 2) / Z + cam.x;
  const sy = (e.clientY - cv.height / 2) / Z + cam.y;
  target = fromIso(sx, sy);
});

async function main() {
  const [anakin, bmeta] = await Promise.all([
    loadCharacter(Q.get('anakin') || '/tools/sprites/out/review/anakin_256.json'),
    loadBuilding(Q.get('building') || '/tools/sprites/out/buildings/underBlock_1_512.json'),
  ]);
  // a short street: buildings along both sides
  const buildings = [
    [6, 2], [12, 2], [2, 9], [2, 15],
  ].map(([x, y], i) => ({ x, y, meta: bmeta, phase: i * 1.7, drop: null, poly: bmeta.footprint.map(([fx, fy]) => [x + fx, y + fy]) }));
  const p = { x: 8, y: 9, facing: 0, anim: 'idle', t: 0 };
  const blocked = (x, y) => buildings.some((b) => inPoly(x, y, b.poly));
  const anims = Object.keys(anakin.anims);
  const run = anims.includes('run') ? 'run' : anims[0];
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // rAF time can start just before `last`
    last = now;
    const t = now / 1000;
    // --- walk
    let dx = 0, dy = 0;
    const k = keys;
    if (k.has('w') || k.has('arrowup')) (dx -= 1), (dy -= 1);
    if (k.has('s') || k.has('arrowdown')) (dx += 1), (dy += 1);
    if (k.has('a') || k.has('arrowleft')) (dx -= 1), (dy += 1);
    if (k.has('d') || k.has('arrowright')) (dx += 1), (dy -= 1);
    if (!dx && !dy && target) {
      dx = target.x - p.x;
      dy = target.y - p.y;
      if (Math.hypot(dx, dy) < 0.15) target = null, (dx = dy = 0);
    }
    if (dx || dy) {
      const l = Math.hypot(dx, dy);
      const sp = 3.2 * dt;
      const nx = p.x + (dx / l) * sp;
      const ny = p.y + (dy / l) * sp;
      if (!blocked(nx, p.y)) p.x = nx;
      if (!blocked(p.x, ny)) p.y = ny;
      p.facing = Math.atan2(dy, dx);
      p.anim = run;
    } else p.anim = 'idle' in anakin.anims ? 'idle' : anims[0];
    p.t += dt;
    // --- camera
    const ps = iso(p.x, p.y);
    cam = { x: ps.x, y: ps.y - 30 };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#06070b';
    g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(Z, 0, 0, Z, cv.width / 2 - cam.x * Z, cv.height / 2 - cam.y * Z);
    g.imageSmoothingEnabled = true;
    // --- the wet street: dark slabs with a sheen
    for (let ty = -6; ty < 24; ty++)
      for (let tx = -6; tx < 24; tx++) {
        const a = iso(tx, ty);
        const v = 18 + ((tx * 7 + ty * 13) % 5);
        g.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(a.x + HALF_W, a.y + HALF_H);
        g.lineTo(a.x, a.y + HALF_H * 2);
        g.lineTo(a.x - HALF_W, a.y + HALF_H);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 0.5;
        g.stroke();
      }
    // --- floor reflections of the neon (additive, flickering with it)
    for (const b of buildings) b.level = neonLevel(b, t);
    g.globalCompositeOperation = 'lighter';
    for (const b of buildings) {
      const s = iso(b.x, b.y);
      const m = b.meta;
      g.globalAlpha = Math.min(1, b.level);
      g.drawImage(b.meta.img.reflect, s.x - m.anchor[0] * m.k, s.y - m.anchor[1] * m.k, m.size * m.k, m.size * m.k);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // --- Anakin's frame and shadow
    const A = anakin.anims[p.anim];
    const fi = Math.floor(p.t * A.fps) % A.frames.length;
    let di = Math.round(p.facing / ((Math.PI * 2) / anakin.dirs)) % anakin.dirs;
    if (di < 0) di += anakin.dirs;
    const fr = A.frames[fi][di];
    const ak = anakin.k;
    const sh = fr.s;
    g.drawImage(anakin.shadowImg[sh.p], sh.x, sh.y, sh.w, sh.h, ps.x - sh.ox * ak, ps.y - sh.oy * ak, sh.w * ak, sh.h * ak);
    const prect = [ps.x - fr.ox * ak, ps.y - fr.oy * ak, fr.w * ak, fr.h * ak];
    // --- sort by the ground y: buildings by their front-most footprint point, Anakin by his feet
    const list = buildings.map((b) => {
      const s = iso(b.x, b.y);
      const m = b.meta;
      return { y: s.y - m.anchor[1] * m.k + m.sort[1] * m.k, b, s };
    });
    list.push({ y: ps.y, anakin: true });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.anakin) {
        g.drawImage(anakin.img[fr.p], fr.x, fr.y, fr.w, fr.h, prect[0], prect[1], prect[2], prect[3]);
        // the saber: the game draws the blade from the frame's markers
        const sb = fr.m && fr.m.saberBase;
        const st = fr.m && fr.m.saberTip;
        if (sb && st) {
          g.globalCompositeOperation = 'lighter';
          g.lineCap = 'round';
          for (const [w, c] of [[6, 'rgba(60,130,255,0.25)'], [3, 'rgba(90,160,255,0.6)'], [1.2, 'rgba(235,245,255,0.95)']]) {
            g.strokeStyle = c;
            g.lineWidth = w;
            for (const [s0, s1] of (fr.b && fr.b.saber) || [[0, 1]]) {
              g.beginPath();
              g.moveTo(ps.x + sb[0] + (st[0] - sb[0]) * s0, ps.y + sb[1] + (st[1] - sb[1]) * s0);
              g.lineTo(ps.x + sb[0] + (st[0] - sb[0]) * s1, ps.y + sb[1] + (st[1] - sb[1]) * s1);
              g.stroke();
            }
          }
          g.globalCompositeOperation = 'source-over';
        }
        continue;
      }
      const { b, s } = it;
      const m = b.meta;
      const x0 = s.x - m.anchor[0] * m.k;
      const y0 = s.y - m.anchor[1] * m.k;
      const W = m.size * m.k;
      // in front of Anakin and overlapping him: see-through
      const behind = it.y > ps.y && prect[0] + prect[2] > x0 && prect[0] < x0 + W && prect[1] + prect[3] > y0 && prect[1] < y0 + W;
      b.fade = (b.fade ?? 1) + ((behind ? 0.4 : 1) - (b.fade ?? 1)) * Math.min(1, dt * 8);
      g.globalAlpha = b.fade;
      g.drawImage(m.img.body, x0, y0, W, W);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = b.fade * Math.min(1, b.level);
      g.drawImage(m.img.neon, x0, y0, W, W);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    // footprints (press F)
    if (k.has('f')) {
      g.strokeStyle = '#ff0';
      for (const b of buildings) {
        g.beginPath();
        b.poly.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, iso(x, y).x, iso(x, y).y));
        g.closePath();
        g.stroke();
      }
    }
    info.innerHTML = `스프라이트 검토 · WASD/클릭 이동 · F 충돌 다각형<br>${p.anim} · 방향 ${di}/${anakin.dirs} · 프레임 ${fi}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
main().catch((e) => (info.textContent = '불러오기 실패: ' + e.message));
