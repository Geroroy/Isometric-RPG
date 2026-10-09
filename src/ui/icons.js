// Procedural 32x32 pixel-art icons for skills and command buttons.

const S = 32;
const cache = new Map();

function base(ctx, c1, c2) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

function saber(ctx, x1, y1, x2, y2, color = '#5ab0ff', hilt = true) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#eaf6ff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (hilt) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const l = Math.hypot(dx, dy);
    ctx.strokeStyle = '#b8bcc4';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (dx / l) * 6, y1 + (dy / l) * 6);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function bolt(ctx, x1, y1, x2, y2) {
  ctx.strokeStyle = 'rgba(255,60,40,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = '#ffd0c8';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function arc(ctx, x, y, r, a0, a1, color, w = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.stroke();
}

function hand(ctx, x, y, color = '#c9a084') {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 8, 9);
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 2, y - 5 + (i === 0 || i === 3 ? 2 : 0), 2, 6);
  ctx.fillRect(x - 3, y + 2, 3, 3);
}

function helmet(ctx, x, y, stripe = '#2f5fbf', extra = false) {
  ctx.fillStyle = '#e8e8e4';
  ctx.beginPath();
  ctx.arc(x, y, 9, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 9, y, 18, 8);
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 7, y - 1, 14, 3);
  ctx.fillRect(x - 1.5, y, 3, 7);
  ctx.fillStyle = stripe;
  ctx.fillRect(x - 1, y - 9, 2, 6);
  if (extra) {
    ctx.fillRect(x - 9, y - 3, 3, 3);
    ctx.fillRect(x + 6, y - 3, 3, 3);
    ctx.fillRect(x - 6, y + 4, 4, 3);
  }
}

const DRAW = {
  attack(ctx) {
    base(ctx, '#2a3448', '#10141e');
    saber(ctx, 8, 25, 26, 6);
  },
  flurry(ctx) {
    base(ctx, '#20304c', '#0c1220');
    saber(ctx, 5, 26, 20, 4, '#5ab0ff', false);
    saber(ctx, 11, 28, 27, 9, '#5ab0ff', false);
    saber(ctx, 4, 16, 28, 18, '#5ab0ff', true);
  },
  shien(ctx) {
    base(ctx, '#1d2a40', '#0a0f18');
    saber(ctx, 16, 28, 16, 4);
    bolt(ctx, 2, 10, 14, 14);
    bolt(ctx, 30, 8, 19, 13);
    bolt(ctx, 18, 16, 30, 24);
  },
  djemso(ctx) {
    base(ctx, '#2c2a40', '#100e18');
    saber(ctx, 16, 6, 16, 26);
    arc(ctx, 16, 28, 10, Math.PI * 1.05, Math.PI * 1.95, '#9fd0ff', 2);
    ctx.fillStyle = '#ffe4a0';
    ctx.fillRect(5, 26, 3, 2);
    ctx.fillRect(24, 26, 3, 2);
  },
  throw(ctx) {
    base(ctx, '#1a2a44', '#0a0f1a');
    arc(ctx, 16, 16, 11, 0.3, Math.PI * 1.7, 'rgba(90,170,255,0.6)', 3);
    saber(ctx, 9, 21, 23, 11);
  },
  barrier(ctx) {
    base(ctx, '#18304a', '#08121c');
    arc(ctx, 16, 22, 13, Math.PI, Math.PI * 2, '#7fc4ff', 3);
    arc(ctx, 16, 22, 9, Math.PI, Math.PI * 2, 'rgba(160,210,255,0.5)', 2);
    bolt(ctx, 2, 4, 8, 12);
    bolt(ctx, 30, 3, 25, 11);
    saber(ctx, 16, 28, 16, 12);
  },
  fury(ctx) {
    base(ctx, '#401818', '#150606');
    for (let i = 0; i < 3; i++) arc(ctx, 16, 16, 5 + i * 4, i, i + 4, i === 2 ? '#ff6a3a' : '#5ab0ff', 2);
    ctx.fillStyle = '#ffd040';
    ctx.fillRect(15, 15, 3, 3);
  },
  push(ctx) {
    base(ctx, '#2a2048', '#0e0a1a');
    hand(ctx, 5, 13);
    for (let i = 0; i < 3; i++) arc(ctx, 10, 17, 9 + i * 5, -0.7, 0.7, i % 2 ? '#c8b6ff' : '#e8f0ff', 2);
  },
  speed(ctx) {
    base(ctx, '#183048', '#081018');
    ctx.fillStyle = '#9fdcff';
    for (let i = 0; i < 5; i++) ctx.fillRect(3 + i * 2, 7 + i * 4, 14 - i, 2);
    ctx.fillStyle = '#e8f6ff';
    ctx.beginPath();
    ctx.moveTo(18, 6);
    ctx.lineTo(29, 16);
    ctx.lineTo(18, 26);
    ctx.lineTo(21, 16);
    ctx.fill();
  },
  leap(ctx) {
    base(ctx, '#2a2448', '#0e0c1a');
    arc(ctx, 16, 26, 12, Math.PI * 1.1, Math.PI * 1.9, '#c9b5ff', 2);
    ctx.fillStyle = '#c9b5ff';
    ctx.fillRect(25, 21, 4, 4);
    ctx.fillStyle = 'rgba(200,180,255,0.4)';
    ctx.fillRect(2, 27, 28, 2);
    saber(ctx, 13, 12, 20, 4, '#5ab0ff', false);
  },
  precog(ctx) {
    base(ctx, '#20284a', '#0a0c1a');
    ctx.fillStyle = '#e8eef8';
    ctx.beginPath();
    ctx.ellipse(16, 16, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a7fd0';
    ctx.beginPath();
    ctx.arc(16, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#081020';
    ctx.fillRect(15, 15, 3, 3);
    arc(ctx, 16, 16, 14, 0, Math.PI * 2, 'rgba(160,200,255,0.4)', 1);
  },
  choke(ctx) {
    base(ctx, '#3a0e12', '#120406');
    ctx.fillStyle = '#c9a084';
    ctx.fillRect(8, 16, 10, 8);
    ctx.fillRect(18, 12, 3, 8);
    ctx.fillRect(9, 11, 2, 5);
    ctx.fillRect(12, 10, 2, 6);
    ctx.fillRect(15, 10, 2, 6);
    arc(ctx, 22, 9, 6, 0, Math.PI * 2, '#ff4040', 2);
    ctx.fillStyle = 'rgba(255,40,40,0.35)';
    ctx.fillRect(0, 0, 32, 32);
  },
  repulse(ctx) {
    base(ctx, '#281c48', '#0a0618');
    for (let i = 0; i < 4; i++) arc(ctx, 16, 16, 3 + i * 4, 0, Math.PI * 2, i % 2 ? '#c8b6ff' : '#ffffff', i === 0 ? 3 : 1.5);
  },
  clones(ctx) {
    base(ctx, '#283040', '#0c1018');
    helmet(ctx, 11, 17);
    helmet(ctx, 22, 15);
  },
  mechanic(ctx) {
    base(ctx, '#3a3020', '#14100a');
    ctx.fillStyle = '#b8bcc4';
    ctx.save();
    ctx.translate(16, 16);
    ctx.rotate(-0.8);
    ctx.fillRect(-2, -12, 4, 22);
    ctx.fillRect(-6, -14, 12, 5);
    ctx.fillStyle = '#3a3020';
    ctx.fillRect(-2, -15, 4, 4);
    ctx.restore();
    ctx.fillStyle = '#9fdcff';
    ctx.fillRect(22, 6, 2, 6);
    ctx.fillRect(24, 10, 2, 5);
    ctx.fillRect(6, 22, 5, 2);
  },
  r2(ctx) {
    base(ctx, '#1e2c44', '#0a1018');
    ctx.fillStyle = '#e8eaee';
    ctx.fillRect(9, 15, 14, 13);
    ctx.fillStyle = '#b8bfc8';
    ctx.beginPath();
    ctx.arc(16, 15, 7, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#2f5ba8';
    ctx.fillRect(13, 10, 4, 3);
    ctx.fillRect(12, 18, 3, 7);
    ctx.fillRect(18, 18, 3, 4);
    ctx.fillStyle = '#ff3a3a';
    ctx.fillRect(19, 11, 2, 2);
    ctx.fillStyle = '#e8eaee';
    ctx.fillRect(6, 17, 3, 12);
    ctx.fillRect(23, 17, 3, 12);
  },
  command(ctx) {
    base(ctx, '#3a2c18', '#140e06');
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(8, 4, 2, 25);
    ctx.fillStyle = '#2f5fbf';
    ctx.fillRect(10, 5, 16, 11);
    ctx.fillStyle = '#e8e8e4';
    ctx.beginPath();
    ctx.moveTo(12, 7);
    ctx.lineTo(18, 13);
    ctx.lineTo(24, 7);
    ctx.lineTo(24, 10);
    ctx.lineTo(18, 15);
    ctx.lineTo(12, 10);
    ctx.fill();
  },
  rex(ctx) {
    base(ctx, '#202c44', '#0a0e18');
    helmet(ctx, 16, 14, '#2f5fbf', true);
    ctx.fillStyle = '#222';
    ctx.fillRect(3, 25, 9, 3);
    ctx.fillRect(20, 25, 9, 3);
    ctx.fillStyle = '#ff6040';
    ctx.fillRect(2, 25, 2, 2);
    ctx.fillRect(28, 25, 2, 2);
  },
  gunship(ctx) {
    base(ctx, '#2e2a20', '#100e08');
    ctx.fillStyle = '#c2c7c1';
    ctx.fillRect(9, 8, 14, 7);
    ctx.fillRect(3, 11, 26, 3);
    ctx.fillRect(22, 9, 5, 5);
    ctx.fillStyle = '#a8292e';
    ctx.fillRect(10, 11, 5, 3);
    ctx.fillStyle = '#ff9a40';
    for (let i = 0; i < 4; i++) ctx.fillRect(7 + i * 6, 19 + (i % 2) * 4, 2, 5);
    ctx.fillStyle = 'rgba(255,120,40,0.6)';
    ctx.fillRect(4, 28, 24, 3);
  },
  bacta(ctx) {
    base(ctx, '#2e1818', '#100808');
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(11, 5, 10, 23);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(13, 9, 6, 16);
    ctx.fillStyle = '#888';
    ctx.fillRect(10, 4, 12, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(15, 12, 2, 8);
    ctx.fillRect(12, 15, 8, 2);
  },
  skills(ctx) {
    base(ctx, '#2a2a40', '#0c0c18');
    ctx.fillStyle = '#ffd27f';
    ctx.fillRect(14, 4, 4, 24);
    ctx.fillRect(6, 10, 4, 18);
    ctx.fillRect(22, 10, 4, 18);
    ctx.fillRect(6, 12, 20, 2);
  },
  character(ctx) {
    base(ctx, '#2a2a40', '#0c0c18');
    ctx.fillStyle = '#c9a084';
    ctx.beginPath();
    ctx.arc(16, 11, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6e4a2c';
    ctx.fillRect(11, 5, 10, 4);
    ctx.fillStyle = '#2b3b6b';
    ctx.fillRect(9, 17, 14, 12);
    ctx.fillStyle = '#5a6066';
    ctx.fillRect(11, 17, 10, 4);
  },
  empty(ctx) {
    base(ctx, '#181c24', '#0a0c10');
  },
  spar(ctx) {
    base(ctx, '#1d2a1e', '#0a100a');
    saber(ctx, 8, 26, 24, 6, '#5ab0ff');
    saber(ctx, 24, 26, 8, 6, '#6aff7a');
  },
  cards(ctx) {
    base(ctx, '#2a2414', '#100c06');
    ctx.fillStyle = '#4a6fbf';
    ctx.fillRect(7, 6, 13, 19);
    ctx.fillStyle = '#e9c47a';
    ctx.fillRect(12, 8, 13, 19);
    ctx.fillStyle = '#5a3f14';
    ctx.fillRect(14, 10, 9, 8);
  },
  might(ctx) {
    DRAW.fury(ctx);
  },
  credits(ctx) {
    base(ctx, '#2a2414', '#100c06');
    ctx.fillStyle = '#e9c47a';
    ctx.beginPath();
    ctx.arc(16, 16, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a6a2a';
    ctx.fillRect(12, 12, 8, 8);
    ctx.fillStyle = '#e9c47a';
    ctx.fillRect(14, 14, 4, 4);
  },
  talk(ctx) {
    base(ctx, '#1a2430', '#0a0e14');
    ctx.fillStyle = '#d6e6f2';
    ctx.fillRect(6, 8, 20, 12);
    ctx.fillRect(10, 20, 4, 4);
    ctx.fillStyle = '#1a2430';
    ctx.fillRect(9, 12, 3, 3);
    ctx.fillRect(15, 12, 3, 3);
    ctx.fillRect(21, 12, 3, 3);
  },
};

export function iconCanvas(id) {
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  (DRAW[id] || DRAW.empty)(ctx);
  // bevel
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, S, 1);
  ctx.fillRect(0, 0, 1, S);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, S - 1, S, 1);
  ctx.fillRect(S - 1, 0, 1, S);
  cache.set(id, c);
  return c;
}

const urls = new Map();
export function iconURL(id) {
  if (!urls.has(id)) urls.set(id, iconCanvas(id).toDataURL());
  return urls.get(id);
}
