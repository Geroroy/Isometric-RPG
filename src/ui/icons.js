// Ability and command icons after Star Wars Battlefront II (2017): flat white
// vector silhouettes on a transparent background, drawn in a 100×100 space
// and rasterised once at 64×64. Holes are punched out with destination-out.

const S = 64;
const INK = '#f2f1ea';
const cache = new Map();
const TAU = Math.PI * 2;

function pts(ctx, p) {
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](p[i], p[i + 1]);
  ctx.closePath();
}
const poly = (ctx, ...p) => (pts(ctx, p), ctx.fill());
function disc(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
function ring(ctx, x, y, r, w, a0 = 0, a1 = TAU) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.stroke();
}
function line(ctx, w, ...p) {
  ctx.lineWidth = w;
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](p[i], p[i + 1]);
  ctx.stroke();
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function svg(ctx, d) {
  ctx.fill(new Path2D(d));
}
/** Draw `fn` as negative space (punches through what is already there). */
function cut(ctx, fn) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = ctx.strokeStyle = '#000';
  fn();
  ctx.restore();
}
/** Swoosh: an arc band tapering to points at both ends. */
function swoosh(ctx, x, y, r, a0, a1, w) {
  const n = 24;
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    const rr = r - w * Math.sin((Math.PI * i) / n);
    p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  poly(ctx, ...p);
}
/** Lightsaber from the pommel (x1,y1) to the blade tip (x2,y2). */
function saber(ctx, x1, y1, x2, y2, hilt = 24, w = 7) {
  const l = Math.hypot(x2 - x1, y2 - y1);
  const dx = (x2 - x1) / l;
  const dy = (y2 - y1) / l;
  const hx = x1 + dx * hilt;
  const hy = y1 + dy * hilt;
  ctx.lineCap = 'butt';
  line(ctx, w + 3, x1, y1, hx, hy);
  line(ctx, w + 7, hx - dx * 5, hy - dy * 5, hx, hy); // emitter shroud
  cut(ctx, () => line(ctx, 2, x1 + dx * 6 - dy * 9, y1 + dy * 6 + dx * 9, x1 + dx * 6 + dy * 9, y1 + dy * 6 - dx * 9));
  ctx.lineCap = 'round';
  line(ctx, w, hx + dx * 4, hy + dy * 4, x2 - dx * w * 0.5, y2 - dy * w * 0.5);
}
function arrowHead(ctx, x, y, a, s) {
  const c = Math.cos(a);
  const n = Math.sin(a);
  poly(ctx, x + c * s, y + n * s, x - c * s * 0.6 - n * s * 0.8, y - n * s * 0.6 + c * s * 0.8, x - c * s * 0.6 + n * s * 0.8, y - n * s * 0.6 - c * s * 0.8);
}
/** Phase II clone helmet centred on (x, y), `k` = scale (1 ≈ 56 units tall). */
function helmet(ctx, x, y, k = 1, punch = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  svg(ctx, 'M-26 4 C-28 -26 28 -26 26 4 L28 18 L20 26 L-20 26 L-28 18 Z');
  if (punch)
    cut(ctx, () => {
      // T visor: brow bar, nose bridge, flared cheeks
      svg(ctx, 'M-19 -4 L19 -4 L19 3 L5 3 L5 12 L9 18 L-9 18 L-5 12 L-5 3 L-19 3 Z');
      line(ctx, 2, -14, 20, -10, 20);
      line(ctx, 2, 10, 20, 14, 20);
    });
  ctx.restore();
}
/** Outline used to separate overlapping silhouettes. */
function helmetGap(ctx, x, y, k) {
  cut(ctx, () => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineWidth = 8;
    ctx.stroke(new Path2D('M-26 4 C-28 -26 28 -26 26 4 L28 18 L20 26 L-20 26 L-28 18 Z'));
    ctx.restore();
  });
}

const DRAW = {
  attack(ctx) {
    saber(ctx, 18, 84, 82, 18, 24, 8);
  },
  flurry(ctx) {
    saber(ctx, 14, 88, 62, 28, 22, 5);
    swoosh(ctx, 50, 60, 42, -2.9, -0.55, 9);
    swoosh(ctx, 54, 58, 30, -2.6, -0.9, 6);
    swoosh(ctx, 44, 52, 44, 0.3, 1.25, 6);
  },
  shien(ctx) {
    saber(ctx, 50, 94, 50, 8);
    ctx.lineCap = 'round';
    line(ctx, 6, 6, 26, 38, 44);
    line(ctx, 6, 62, 44, 92, 18);
    poly(ctx, 50, 32, 55, 41, 64, 44, 55, 48, 50, 57, 45, 48, 36, 44, 45, 41);
  },
  djemso(ctx) {
    saber(ctx, 26, 16, 70, 84, 22);
    swoosh(ctx, 54, 64, 44, -2.7, -0.4, 10);
    ctx.lineCap = 'round';
    line(ctx, 5, 52, 94, 90, 94);
    line(ctx, 4, 84, 86, 94, 76);
  },
  throw(ctx) {
    saber(ctx, 28, 70, 70, 30, 16, 5);
    ctx.lineCap = 'butt';
    ring(ctx, 50, 50, 40, 6, -2.6, -0.5);
    ring(ctx, 50, 50, 40, 6, 0.55, 2.65);
    arrowHead(ctx, 50 + Math.cos(-0.5) * 40, 50 + Math.sin(-0.5) * 40, -0.5 + Math.PI / 2, 11);
    arrowHead(ctx, 50 + Math.cos(2.65) * 40, 50 + Math.sin(2.65) * 40, 2.65 + Math.PI / 2, 11);
  },
  barrier(ctx) {
    svg(ctx, 'M50 6 L88 18 L86 52 C82 74 66 88 50 96 C34 88 18 74 14 52 L12 18 Z');
    cut(ctx, () => svg(ctx, 'M50 16 L78 25 L77 51 C74 68 62 79 50 86 C38 79 26 68 23 51 L22 25 Z'));
    saber(ctx, 38, 76, 62, 24, 14, 5);
  },
  signature(ctx) {
    // forehand / backhand: two opposing swooshes crossing the blade
    saber(ctx, 50, 94, 50, 10, 22, 6);
    swoosh(ctx, 50, 50, 40, -2.75, -0.35, 9);
    swoosh(ctx, 50, 50, 40, 0.39, 2.75, 9);
    arrowHead(ctx, 50 + Math.cos(-0.35) * 36, 50 + Math.sin(-0.35) * 36, -0.35 + Math.PI / 2, 9);
    arrowHead(ctx, 50 + Math.cos(2.75) * 36, 50 + Math.sin(2.75) * 36, 2.75 + Math.PI / 2, 9);
  },
  fury(ctx) {
    svg(ctx, 'M50 96 C22 96 10 74 18 52 C22 62 28 66 32 64 C24 44 34 22 52 6 C48 26 58 34 62 42 C64 34 70 28 72 20 C88 42 92 70 80 84 C72 92 62 96 50 96 Z');
    cut(ctx, () => {
      ctx.lineCap = 'round';
      line(ctx, 7, 34, 84, 66, 36);
      line(ctx, 11, 26, 92, 36, 80);
    });
  },
  push(ctx) {
    rrect(ctx, 14, 46, 30, 34, 7);
    rrect(ctx, 15, 22, 6, 30, 3);
    rrect(ctx, 23, 16, 6, 34, 3);
    rrect(ctx, 31, 18, 6, 32, 3);
    rrect(ctx, 39, 26, 6, 26, 3);
    ctx.lineCap = 'round';
    line(ctx, 7, 42, 64, 52, 50);
    ctx.lineCap = 'butt';
    for (const [r, w] of [[22, 6], [34, 5], [46, 4]]) ring(ctx, 40, 52, r, w, -0.65, 0.65);
  },
  speed(ctx) {
    for (const x of [22, 46]) poly(ctx, x, 20, x + 14, 20, x + 38, 50, x + 14, 80, x, 80, x + 24, 50);
    ctx.lineCap = 'round';
    line(ctx, 5, 4, 36, 14, 36);
    line(ctx, 5, 2, 50, 18, 50);
    line(ctx, 5, 4, 64, 14, 64);
  },
  leap(ctx) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(14, 84);
    ctx.quadraticCurveTo(36, 8, 78, 58);
    ctx.stroke();
    arrowHead(ctx, 82, 64, 1.0, 13);
    line(ctx, 5, 6, 94, 30, 94);
    line(ctx, 5, 66, 94, 94, 94);
  },
  precog(ctx) {
    svg(ctx, 'M6 56 C24 30 76 30 94 56 C76 82 24 82 6 56 Z');
    cut(ctx, () => disc(ctx, 50, 56, 18));
    disc(ctx, 50, 56, 11);
    cut(ctx, () => disc(ctx, 45, 51, 3.5));
    ctx.lineCap = 'round';
    line(ctx, 5, 50, 8, 50, 20);
    line(ctx, 5, 22, 16, 28, 26);
    line(ctx, 5, 78, 16, 72, 26);
  },
  choke(ctx) {
    // a clenching claw over a crushing ring
    svg(ctx, 'M30 96 L30 72 C24 66 24 58 28 54 L64 54 C72 58 74 68 70 76 L66 96 Z');
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    for (const [x, h] of [[33, 30], [44, 36], [55, 34], [65, 26]]) {
      ctx.beginPath();
      ctx.moveTo(x, 58);
      ctx.quadraticCurveTo(x - 2, 58 - h, x - 14, 58 - h * 0.7);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(70, 72);
    ctx.quadraticCurveTo(86, 64, 82, 48);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ring(ctx, 30, 26, 14, 4, 0.4, 5.0);
  },
  repulse(ctx) {
    disc(ctx, 50, 50, 12);
    ctx.lineCap = 'butt';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      ring(ctx, 50, 50, 26, 6, a - 0.28, a + 0.28);
      arrowHead(ctx, 50 + Math.cos(a) * 41, 50 + Math.sin(a) * 41, a, 9);
    }
  },
  clones(ctx) {
    helmet(ctx, 24, 40, 0.62);
    helmet(ctx, 76, 40, 0.62);
    helmetGap(ctx, 50, 60, 0.78);
    helmet(ctx, 50, 60, 0.78);
  },
  mechanic(ctx) {
    // gear behind a wrench
    ctx.save();
    ctx.translate(62, 38);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      ctx.fillRect(-5, -30, 10, 12);
    }
    ctx.restore();
    disc(ctx, 62, 38, 22);
    cut(ctx, () => disc(ctx, 62, 38, 9));
    cut(ctx, () => line(ctx, 18, 16, 88, 56, 48));
    ctx.lineCap = 'round';
    line(ctx, 10, 16, 86, 50, 52);
    disc(ctx, 52, 50, 13);
    cut(ctx, () => {
      ctx.save();
      ctx.translate(52, 50);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-4, -16, 8, 14);
      ctx.restore();
    });
  },
  r2(ctx) {
    svg(ctx, 'M28 40 C28 12 72 12 72 40 Z');
    ctx.fillRect(30, 42, 40, 40);
    poly(ctx, 36, 82, 64, 82, 58, 92, 42, 92);
    rrect(ctx, 14, 36, 11, 52, 3);
    rrect(ctx, 75, 36, 11, 52, 3);
    poly(ctx, 10, 88, 29, 88, 29, 96, 6, 96);
    poly(ctx, 71, 88, 90, 88, 94, 96, 71, 96);
    cut(ctx, () => {
      disc(ctx, 50, 28, 6);
      ctx.fillRect(38, 50, 24, 4);
      ctx.fillRect(38, 58, 10, 14);
      ctx.fillRect(52, 58, 10, 6);
      ctx.fillRect(18, 44, 3, 30);
      ctx.fillRect(79, 44, 3, 30);
    });
  },
  command(ctx) {
    // Galactic Republic crest
    disc(ctx, 50, 50, 46);
    cut(ctx, () => disc(ctx, 50, 50, 39));
    disc(ctx, 50, 50, 14);
    cut(ctx, () => disc(ctx, 50, 50, 8));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2;
      const r1 = 18;
      const r2 = i % 2 ? 32 : 38;
      const w0 = 0.12;
      const w1 = i % 2 ? 0.22 : 0.28;
      poly(ctx,
        50 + Math.cos(a - w0) * r1, 50 + Math.sin(a - w0) * r1,
        50 + Math.cos(a - w1) * r2, 50 + Math.sin(a - w1) * r2,
        50 + Math.cos(a + w1) * r2, 50 + Math.sin(a + w1) * r2,
        50 + Math.cos(a + w0) * r1, 50 + Math.sin(a + w0) * r1);
    }
  },
  rex(ctx) {
    helmet(ctx, 50, 56, 1.25);
    // rangefinder stalk and Rex's jaig-eye marking
    ctx.fillRect(80, 22, 6, 34);
    ctx.fillRect(74, 22, 12, 5);
    cut(ctx, () => {
      ctx.fillRect(76, 30, 4, 30);
      poly(ctx, 32, 40, 40, 30, 46, 40);
      poly(ctx, 54, 40, 60, 30, 68, 40);
    });
  },
  gunship(ctx) {
    // LAAT/i seen from above
    svg(ctx, 'M50 4 L58 16 L60 50 L57 84 L43 84 L40 50 L42 16 Z');
    poly(ctx, 41, 36, 8, 50, 6, 60, 41, 56);
    poly(ctx, 59, 36, 92, 50, 94, 60, 59, 56);
    poly(ctx, 44, 76, 28, 94, 44, 88);
    poly(ctx, 56, 76, 72, 94, 56, 88);
    disc(ctx, 26, 46, 7);
    disc(ctx, 74, 46, 7);
    cut(ctx, () => {
      poly(ctx, 50, 12, 54, 20, 46, 20);
      ctx.fillRect(47, 28, 6, 4);
      ctx.fillRect(14, 54, 24, 2);
      ctx.fillRect(62, 54, 24, 2);
    });
  },
  bacta(ctx) {
    ctx.save();
    ctx.translate(50, 50);
    ctx.rotate(Math.PI / 4);
    rrect(ctx, -12, -30, 24, 46, 4);
    ctx.fillRect(-16, -36, 32, 6);
    ctx.fillRect(-3, -48, 6, 12);
    ctx.fillRect(-12, -50, 24, 5);
    poly(ctx, -6, 16, 6, 16, 2, 24, -2, 24);
    ctx.fillRect(-1, 24, 2, 22);
    cut(ctx, () => {
      ctx.fillRect(-3, -20, 6, 26);
      ctx.fillRect(-10, -10, 20, 6);
    });
    ctx.restore();
  },
  skills(ctx) {
    ctx.lineCap = 'round';
    line(ctx, 6, 50, 22, 24, 74);
    line(ctx, 6, 50, 22, 76, 74);
    line(ctx, 6, 24, 74, 76, 74);
    for (const [x, y] of [[50, 22], [24, 76], [76, 76]]) {
      disc(ctx, x, y, 15);
      cut(ctx, () => disc(ctx, x, y, 7));
    }
  },
  character(ctx) {
    disc(ctx, 50, 32, 18);
    svg(ctx, 'M14 94 C14 66 30 56 50 56 C70 56 86 66 86 94 Z');
    cut(ctx, () => line(ctx, 5, 50, 52, 50, 60));
  },
  empty(ctx) {
    ctx.globalAlpha = 0.18;
    ctx.setLineDash([8, 8]);
    ring(ctx, 50, 50, 30, 4);
  },
  spar(ctx) {
    saber(ctx, 16, 86, 82, 18, 20, 5);
    cut(ctx, () => line(ctx, 14, 84, 86, 18, 18));
    saber(ctx, 84, 86, 18, 18, 20, 5);
  },
  cards(ctx) {
    ctx.save();
    ctx.translate(50, 52);
    ctx.rotate(-0.22);
    rrect(ctx, -30, -38, 46, 70, 5);
    cut(ctx, () => rrect(ctx, -25, -33, 36, 60, 3));
    ctx.rotate(0.38);
    cut(ctx, () => rrect(ctx, -16, -40, 54, 78, 7));
    rrect(ctx, -12, -36, 46, 70, 5);
    cut(ctx, () => {
      const p = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const r = i % 2 ? 7 : 16;
        p.push(11 + Math.cos(a) * r, -1 + Math.sin(a) * r);
      }
      poly(ctx, ...p);
    });
    ctx.restore();
  },
  might(ctx) {
    for (const y of [12, 40, 68]) poly(ctx, 50, y, 86, y + 26, 86, y + 34, 50, y + 12, 14, y + 34, 14, y + 26);
  },
  credits(ctx) {
    disc(ctx, 50, 50, 44);
    cut(ctx, () => ring(ctx, 50, 50, 36, 4));
    const p = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      p.push(50 + Math.cos(a) * 20, 50 + Math.sin(a) * 20);
    }
    cut(ctx, () => poly(ctx, ...p));
    disc(ctx, 50, 50, 8);
  },
  talk(ctx) {
    rrect(ctx, 6, 14, 88, 58, 14);
    poly(ctx, 22, 66, 40, 66, 18, 90);
    cut(ctx, () => {
      disc(ctx, 30, 43, 7);
      disc(ctx, 50, 43, 7);
      disc(ctx, 70, 43, 7);
    });
  },
};

export function iconCanvas(id) {
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.scale(S / 100, S / 100);
  ctx.fillStyle = ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  (DRAW[id] || DRAW.empty)(ctx);
  cache.set(id, c);
  return c;
}

const urls = new Map();
export function iconURL(id) {
  if (!urls.has(id)) urls.set(id, iconCanvas(id).toDataURL());
  return urls.get(id);
}
