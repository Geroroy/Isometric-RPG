// Anakin's HUD portrait. Two modes:
//   * photo: a photo the player picks (stored on their device) or one deployed
//     at portrait/anakin.jpg, cropped and graded live (breathing drift, dark
//     side grade, hit flash).
//   * fallback: the hand-composed pixel-art portrait described below.
//
// Composition follows the reference art: Anakin in 3/4 view looking to the
// left, saber held low in his right hand with the blade cutting diagonally up
// across the frame, left arm (with the Republic pauldron) reaching out to the
// right. Backdrops: a lavender starship corridor with a lit doorway, or the
// green-lit hangar of a droid factory.
//
// Pipeline per frame: large shapes are painted with canvas paths at 4x
// resolution → downsampled to 96x80 → posterized with a Bayer dither → facial
// features are placed pixel by pixel → the saber blade is lit per-pixel and
// spills blue light.

const LW = 96;
const LH = 80;
const S = 4;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

// saber (low-res coordinates)
const HILT_A = [36, 69];
const HILT_B = [46, 58];
const BLADE_TIP = [104, 0];

const C = {
  skin: '#d8a27c',
  skinHi: '#efc6a2',
  skinSh: '#a06c52',
  skinDeep: '#7a4e3c',
  hair: '#4c311f',
  hairMid: '#6a4529',
  hairHi: '#93683f',
  maroon: '#6e1c24',
  maroonHi: '#93303a',
  navy: '#26365e',
  navyHi: '#3a4f84',
  tunic: '#262b38',
  plate: '#59616b',
  plateHi: '#8d959f',
  plateSh: '#2c3137',
  glove: '#2b201a',
  gloveHi: '#4a382c',
  silver: '#c3c7cf',
  red: '#c0282e',
};

function path(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) ctx.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function rad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

export class Portrait {
  constructor() {
    this.hi = document.createElement('canvas');
    this.hi.width = LW * S;
    this.hi.height = LH * S;
    this.hctx = this.hi.getContext('2d');
    this.lo = document.createElement('canvas');
    this.lo.width = LW;
    this.lo.height = LH;
    this.lctx = this.lo.getContext('2d', { willReadFrequently: true });
    this.t = 0;
    this.blinkT = 2.5;
    this.talkT = 0;
    this.lookT = 1;
    this.look = 0;
    this.darkness = 0;
    this.dead = false;
    this.scene = 'corridor';
    this.hurtT = 0;
    this.photo = null; // user photo (HTMLImageElement) replaces the pixel art
    this.crop = { x: 0.5, y: 0.3, zoom: 1.6 };
  }

  /** Use a photo as the portrait. crop = focus point (0..1) + zoom (>= 1). */
  setPhoto(img, crop) {
    this.photo = img;
    if (crop) this.crop = { ...this.crop, ...crop };
  }

  clearPhoto() {
    this.photo = null;
  }

  /** 'corridor' (lavender starship interior) or 'hangar' (green droid factory). */
  setScene(name) {
    if (name !== this.scene) {
      this.scene = name;
    }
  }

  talk(dur) {
    this.talkT = dur;
  }

  hurt() {
    this.hurtT = 0.35;
  }

  update(dt, darkness = 0, dead = false) {
    this.t += dt;
    this.darkness = darkness;
    this.dead = dead;
    this.blinkT -= dt;
    if (this.blinkT < -0.14) this.blinkT = 2 + Math.random() * 4;
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 1.2 + Math.random() * 3;
      this.look = Math.random() < 0.6 ? 0 : Math.random() < 0.5 ? -1 : 1;
    }
    if (this.talkT > 0) this.talkT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
  }

  // ------------------------------------------------------------------ painting

  paintBackground(ctx) {
    const dark = Math.max(0, (this.darkness - 40) / 60);
    if (this.scene === 'hangar') {
      ctx.fillStyle = lin(ctx, 0, 0, LW, LH, [[0, '#061810'], [0.6, '#0f2b1b'], [1, '#081a10']]);
      ctx.fillRect(0, 0, LW, LH);
      // receding ceiling lights
      const rows = [[6, 5.5, 3], [15, 3.6, 2.1], [22, 2.4, 1.4], [27, 1.6, 1]];
      for (const [y, rx, ry] of rows) {
        for (let i = -3; i <= 3; i++) {
          const x = 48 + i * rx * 3.4;
          const fl = 0.75 + 0.25 * Math.sin(this.t * 3 + i * 1.7 + y);
          ellipse(ctx, x, y, rx * 2.2, ry * 2.4, `rgba(80,255,140,${0.12 * fl})`);
          ellipse(ctx, x, y, rx, ry, `rgba(170,255,190,${0.9 * fl})`);
        }
      }
      ctx.fillStyle = lin(ctx, 0, 30, 0, LH, [[0, 'rgba(40,120,70,0.25)'], [1, 'rgba(0,0,0,0.4)']]);
      ctx.fillRect(0, 30, LW, LH - 30);
      // gantry silhouette
      ctx.fillStyle = 'rgba(4,14,8,0.8)';
      ctx.fillRect(0, 34, LW, 2);
      for (let x = 2; x < LW; x += 9) ctx.fillRect(x, 34, 1.2, 14);
    } else {
      ctx.fillStyle = lin(ctx, 0, 0, LW, 0, [[0, '#4e4170'], [0.55, '#8c7aa8'], [1, '#c8b8d8']]);
      ctx.fillRect(0, 0, LW, LH);
      // wall panels
      ctx.fillStyle = 'rgba(40,30,60,0.35)';
      for (const x of [7, 19, 31]) ctx.fillRect(x, 0, 1, LH);
      ctx.fillStyle = 'rgba(255,240,255,0.12)';
      for (const x of [8, 20, 32]) ctx.fillRect(x, 0, 0.6, LH);
      // lit doorway with rounded corners (right side)
      ctx.fillStyle = '#7a6894';
      ctx.beginPath();
      ctx.roundRect(58, -4, 34, 52, 6);
      ctx.fill();
      ctx.fillStyle = lin(ctx, 60, 0, 92, 40, [[0, '#e6dcef'], [1, '#bfaed2']]);
      ctx.beginPath();
      ctx.roundRect(61, -2, 28, 46, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(63, 4, 24, 1);
      ctx.fillRect(63, 18, 24, 1);
      // floor seam + soft haze
      ctx.fillStyle = 'rgba(40,30,60,0.4)';
      ctx.fillRect(0, 48, LW, 1);
      ctx.fillStyle = rad(ctx, 76, 22, 2, 40, [[0, 'rgba(255,245,255,0.25)'], [1, 'rgba(255,245,255,0)']]);
      ctx.fillRect(0, 0, LW, LH);
    }
    if (dark > 0) {
      ctx.fillStyle = `rgba(120,10,10,${0.35 * dark})`;
      ctx.fillRect(0, 0, LW, LH);
    }
    // vignette
    ctx.fillStyle = rad(ctx, 48, 36, 30, 66, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.55)']]);
    ctx.fillRect(0, 0, LW, LH);
  }

  paintFigure(ctx, by) {
    ctx.save();
    ctx.translate(0, by);
    // back hair mass (behind neck/shoulders)
    ellipse(ctx, 47, 40, 13, 12, C.hair);
    ellipse(ctx, 42, 23, 17.5, 16.5, C.hair);

    // torso & tunic
    path(ctx, [[2, 82], [8, 64], [18, 57, 30, 56], [56, 56], [70, 57, 80, 63], [88, 82]], C.tunic);
    // tabard strips
    path(ctx, [[14, 64], [24, 58], [22, 82], [10, 82]], C.navy);
    path(ctx, [[56, 58], [66, 61], [70, 82], [59, 82]], C.navy);
    ctx.fillStyle = C.navyHi;
    ctx.fillRect(22, 60, 1, 22);
    ctx.fillRect(57, 60, 1, 22);
    // chest plate
    path(ctx, [[23, 60], [58, 60], [60, 72], [41, 79], [21, 73]], lin(ctx, 24, 58, 56, 78, [[0, C.plateHi], [0.35, C.plate], [1, C.plateSh]]));
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(25, 60.6, 31, 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(24, 68, 34, 0.8);
    // neck & collar
    path(ctx, [[34, 43], [47, 43], [49, 55], [32, 55]], lin(ctx, 33, 44, 49, 55, [[0, C.skinSh], [1, C.skinDeep]]));
    ellipse(ctx, 40.5, 56.5, 12.5, 3.8, C.plateSh);
    path(ctx, [[28, 55], [35, 52], [40.5, 54], [46, 52], [53, 55], [52, 59], [29, 59]], lin(ctx, 28, 52, 28, 59, [[0, C.plateHi], [1, C.plate]]));

    // right shoulder (viewer's left): maroon sleeve under the tabard
    path(ctx, [[0, 64], [8, 58], [16, 58, 20, 64], [16, 74], [0, 78]], lin(ctx, 2, 58, 18, 76, [[0, C.maroonHi], [1, C.maroon]]));
    // left arm reaching out to the right + pauldron with the Republic crest
    path(ctx, [[70, 58], [97, 60], [97, 72], [72, 71]], lin(ctx, 72, 58, 72, 72, [[0, C.maroonHi], [1, C.maroon]]));
    path(ctx, [[88, 59], [97, 59], [97, 73], [88, 72]], lin(ctx, 88, 59, 97, 72, [[0, C.gloveHi], [1, C.glove]]));
    ellipse(ctx, 67, 61, 14, 8.2, lin(ctx, 56, 53, 76, 68, [[0, C.plateHi], [0.5, C.plate], [1, C.plateSh]]), -0.15);
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(71, 61, 2.8, 0, Math.PI * 2);
    ctx.stroke();
    ellipse(ctx, 71, 61, 1, 1, C.red);

    // face (3/4 view looking to the viewer's left), lit from the upper left
    path(
      ctx,
      [[40, 9], [52, 10, 54, 22], [56, 32, 52, 40], [48, 46, 42, 47], [36, 47, 32, 42], [28, 36, 28, 28], [28, 12, 40, 9]],
      rad(ctx, 35, 24, 2, 24, [[0, C.skinHi], [0.45, C.skin], [1, C.skinSh]]),
    );
    // jaw shadow on the near side
    path(ctx, [[51, 24], [56, 33, 52, 40], [48, 46, 42, 47], [48, 42, 50, 32]], 'rgba(100,54,40,0.55)');
    // nose bridge shadow
    path(ctx, [[37, 21], [38, 21], [35, 32], [34, 32]], 'rgba(120,70,52,0.5)');
    // hollow under the cheekbone
    path(ctx, [[44, 33], [49, 31], [47, 39], [43, 40]], 'rgba(150,90,68,0.35)');
    // cheekbone highlight
    ellipse(ctx, 33, 30, 3, 2, 'rgba(255,220,190,0.35)');
    // nose (pointing to the viewer's left)
    path(ctx, [[36, 23], [32, 33], [36, 34]], C.skinSh);
    ellipse(ctx, 33.4, 33.4, 2, 1.3, C.skin);

    // hair: fringe from a side part, locks falling past the jaw
    const hg = lin(ctx, 30, 6, 56, 30, [[0, C.hairHi], [0.4, C.hairMid], [1, C.hair]]);
    path(ctx, [[27, 24], [27, 8, 42, 5], [57, 5, 60, 20], [59, 30, 55, 22], [50, 15, 44, 17], [38, 15, 33, 21], [29, 26, 27, 24]], hg);
    path(ctx, [[28, 19], [24, 29, 26, 40], [27, 45, 30, 42], [28, 32, 31, 24]], C.hair);
    path(ctx, [[53, 17], [61, 24, 60, 36], [62, 47, 56, 52], [57, 44, 54, 39], [57, 30, 52, 22]], hg);
    // wavy strands: alternating highlight / shadow curves
    const strands = [
      [[29, 14], [36, 6], [46, 7], C.hairHi],
      [[33, 18], [39, 10], [48, 11], C.hairHi],
      [[36, 20], [43, 13], [52, 16], C.hair],
      [[46, 8], [55, 9], [58, 20], C.hairHi],
      [[54, 22], [60, 30], [58, 40], C.hairHi],
      [[56, 30], [60, 38], [57, 48], C.hair],
      [[27, 26], [24, 33], [27, 41], C.hairHi],
      [[30, 22], [27, 30], [29, 38], C.hair],
      [[40, 6], [48, 4], [55, 10], C.hairMid],
    ];
    ctx.lineWidth = 0.9;
    for (const [a, c, b, col] of strands) {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      ctx.stroke();
    }
    // curled ends
    for (const [x, y, r] of [[27, 41, 1.8], [30, 43, 1.4], [56, 50, 2], [59, 46, 1.6], [25, 36, 1.4]]) ellipse(ctx, x, y, r, r * 0.8, C.hairMid);

    // gauntleted right forearm crossing up to the hilt
    path(ctx, [[6, 82], [20, 82], [44, 66], [37, 59]], lin(ctx, 8, 82, 42, 60, [[0, C.glove], [1, C.gloveHi]]));
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(14, 78);
    ctx.lineTo(22, 72);
    ctx.stroke();
    // hilt
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.silver;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(HILT_A[0], HILT_A[1]);
    ctx.lineTo(HILT_B[0], HILT_B[1]);
    ctx.stroke();
    ctx.strokeStyle = '#1c1c20';
    ctx.lineWidth = 3.1;
    ctx.beginPath();
    ctx.moveTo(38.5, 66.5);
    ctx.lineTo(42.5, 62.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // gloved fist around the grip
    ellipse(ctx, 41, 63.5, 5, 4, C.glove, -0.8);
    ellipse(ctx, 42, 62, 2.6, 1.5, C.gloveHi, -0.8);
    ctx.restore();
  }

  // ------------------------------------------------------------------ pixel pass

  /** Hand-placed facial features at low resolution (crisp pixels). */
  placeFeatures(px, by) {
    const dark = Math.max(0, (this.darkness - 40) / 60);
    const blink = this.blinkT < 0 || this.dead;
    const iris = dark > 0.5 ? [240, 176, 32] : dark > 0.2 ? [180, 150, 90] : [66, 118, 192];
    const pupil = [24, 20, 30];
    const white = [236, 228, 220];
    const lash = [52, 30, 22];
    const brow = [60, 36, 20];
    const lid = [176, 120, 96];
    const look = this.look;
    const y = 26 + by;
    // thick brows, lowered toward the nose: an intense, brooding look
    for (const [x, yy] of [[28, y - 3], [29, y - 3], [30, y - 3], [31, y - 3], [32, y - 2], [33, y - 2], [30, y - 4], [31, y - 4]]) px(x, yy, brow);
    for (const [x, yy] of [[37, y - 2], [38, y - 2], [39, y - 3], [40, y - 3], [41, y - 3], [42, y - 3], [43, y - 3], [39, y - 4], [40, y - 4], [41, y - 4], [42, y - 4]]) px(x, yy, brow);
    if (blink) {
      for (const x of [29, 30, 31, 32]) px(x, y, lash);
      for (const x of [38, 39, 40, 41, 42, 43]) px(x, y, lash);
    } else {
      // far eye (his right, viewer's left)
      for (const x of [30, 31, 32]) px(x, y - 1, lash);
      px(29, y, lid);
      px(30, y, white);
      px(31 + Math.min(0, look), y, iris);
      px(32, y, lid);
      // near eye; the iris shifts as he glances around
      for (const x of [38, 39, 40, 41, 42]) px(x, y - 1, lash);
      for (const x of [38, 39, 40, 41, 42]) px(x, y, white);
      px(39 + look, y, iris);
      px(40 + look, y, pupil);
      px(41 + look, y, iris);
      px(43, y, lid);
      for (const x of [38, 39, 40, 41, 42, 43]) px(x, y + 1, lid);
      if (dark > 0.5) {
        px(30, y, [200, 60, 40]);
        px(42, y, [200, 60, 40]);
      }
    }
    // the scar through his right eyebrow and down the cheek
    for (const [x, yy] of [[31, y - 6], [31, y - 5], [30, y + 1], [30, y + 2], [30, y + 3], [29, y + 4]]) px(x, yy, [150, 68, 58]);
    // mouth: firm, straight
    const m = 39 + by;
    if (this.talkT > 0 && Math.sin(this.t * 18) > -0.2) {
      for (const x of [33, 34, 35, 36, 37]) px(x, m, [70, 24, 22]);
      for (const x of [34, 35, 36]) px(x, m + 1, [46, 14, 14]);
      for (const x of [33, 37]) px(x, m + 1, [150, 90, 75]);
    } else {
      for (const x of [33, 34, 35, 36, 37, 38]) px(x, m, [110, 56, 46]);
      px(32, m + 1, [140, 80, 64]);
      for (const x of [34, 35, 36, 37]) px(x, m + 1, [200, 140, 112]);
    }
    // nostril and chin cleft accents
    px(33, 34 + by, [110, 64, 50]);
    px(39, 45 + by, [170, 112, 90]);
    px(40, 45 + by, [170, 112, 90]);
  }

  /** Per-pixel lightsaber: hot core, blue glow, light spilling on the scene. */
  lightBlade(d) {
    const [ax, ay] = HILT_B;
    const [bx, by] = BLADE_TIP;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const pulse = 0.88 + 0.12 * Math.sin(this.t * 21) * Math.sin(this.t * 7.3);
    for (let y = 0; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        let t = ((x - ax) * dx + (y - ay) * dy) / len2;
        const behind = t < 0;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + dx * t - x;
        const qy = ay + dy * t - y;
        const dist = Math.sqrt(qx * qx + qy * qy);
        const i = (y * LW + x) * 4;
        if (!behind && dist < 0.75) {
          d[i] = 245;
          d[i + 1] = 252;
          d[i + 2] = 255;
        } else if (!behind && dist < 1.6) {
          d[i] = 150 + 60 * pulse;
          d[i + 1] = 210 + 30 * pulse;
          d[i + 2] = 255;
        } else if (dist < 14) {
          const k = (behind ? 0.35 : 1) * pulse * Math.pow(1 - dist / 14, 2.2);
          d[i] = Math.min(255, d[i] + 40 * k);
          d[i + 1] = Math.min(255, d[i + 1] + 120 * k);
          d[i + 2] = Math.min(255, d[i + 2] + 230 * k);
        }
      }
    }
  }

  render() {
    const h = this.hctx;
    h.setTransform(S, 0, 0, S, 0, 0);
    h.clearRect(0, 0, LW, LH);
    const by = Math.sin(this.t * 1.7) > 0.6 ? -1 : 0; // breathing
    this.paintBackground(h);
    this.paintFigure(h, by);

    const l = this.lctx;
    l.imageSmoothingEnabled = true;
    l.imageSmoothingQuality = 'high';
    l.clearRect(0, 0, LW, LH);
    l.drawImage(this.hi, 0, 0, LW, LH);
    const img = l.getImageData(0, 0, LW, LH);
    const d = img.data;
    // posterize with ordered dither
    const q = 255 / 14;
    for (let y = 0; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        const i = (y * LW + x) * 4;
        const t = BAYER[(y & 3) * 4 + (x & 3)] * q;
        for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] + t) / q) * q));
        d[i + 3] = 255;
      }
    }
    const px = (x, y, rgb) => {
      if (x < 0 || y < 0 || x >= LW || y >= LH) return;
      const i = (y * LW + x) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
    };
    this.placeFeatures(px, by);
    if (!this.dead) this.lightBlade(d);
    if (this.dead) {
      for (let i = 0; i < d.length; i += 4) {
        const g = (d[i] + d[i + 1] + d[i + 2]) / 3;
        d[i] = d[i + 1] = d[i + 2] = g * 0.7;
      }
    }
    l.putImageData(img, 0, 0);
  }

  /** Draw the photo, cropped to cover the target with a slow "breathing" drift. */
  drawPhoto(ctx, w, h) {
    const img = this.photo;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const a = w / h;
    let sw = iw / ih > a ? ih * a : iw;
    let sh = iw / ih > a ? ih : iw / a;
    const z = this.crop.zoom * (1 + 0.012 * Math.sin(this.t * 0.8));
    sw /= z;
    sh /= z;
    const cx = Math.max(sw / 2, Math.min(iw - sw / 2, this.crop.x * iw + Math.sin(this.t * 0.37) * sw * 0.006));
    const cy = Math.max(sh / 2, Math.min(ih - sh / 2, this.crop.y * ih));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, w, h);
  }

  /** Draw the portrait into a target 2D context (photo if set, else pixel art). */
  draw(target, w, h) {
    target.save();
    target.globalCompositeOperation = 'source-over';
    if (this.photo) this.drawPhoto(target, w, h);
    else {
      // pixel portraits animate at ~15 fps, like the originals
      const step = Math.floor(this.t * 15);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.render();
      }
      target.imageSmoothingEnabled = false;
      target.drawImage(this.lo, 0, 0, w, h);
    }
    // the dark side: warm, desaturated grade creeping in
    const k = Math.max(0, (this.darkness - 40) / 60);
    if (k > 0 && this.photo) {
      target.globalCompositeOperation = 'saturation';
      target.fillStyle = `rgba(128,128,128,${0.45 * k})`;
      target.fillRect(0, 0, w, h);
      target.globalCompositeOperation = 'multiply';
      target.fillStyle = `rgba(255,${Math.round(200 - 90 * k)},${Math.round(170 - 110 * k)},1)`;
      target.fillRect(0, 0, w, h);
    }
    if (this.dead) {
      target.globalCompositeOperation = 'saturation';
      target.fillStyle = '#808080';
      target.fillRect(0, 0, w, h);
      target.globalCompositeOperation = 'multiply';
      target.fillStyle = '#5a5a5a';
      target.fillRect(0, 0, w, h);
    }
    target.globalCompositeOperation = 'source-over';
    // soft vignette + hit flash
    const g = target.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(${this.hurtT > 0 ? '170,20,20' : '0,0,0'},${this.hurtT > 0 ? 0.55 + this.hurtT : 0.45})`);
    target.fillStyle = g;
    target.fillRect(0, 0, w, h);
    target.restore();
  }
}
