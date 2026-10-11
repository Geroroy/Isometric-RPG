// Dump one animation of a sprite set as a contact sheet: every frame (columns)
// for chosen facing directions (rows), each drawn on its foot anchor with its
// shadow over a neutral ground, the hit frame outlined. Works for Blender
// sheets and, with ?qaBake=<name>, for the pose code baked in the browser.
//   npm run dev; node tools/qa/spritedump.mjs <out.png> <sprite> <anim> [dirs=0,2,4,6,8,10,12,14] [query] [scale=2]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/dump.png', sprite = 'anakin', anim = 'sig', dirsArg = '0,2,4,6,8,10,12,14', query = '', scaleArg = '2'] = process.argv;
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const browser = await chromium.launch({ executablePath: findChrome('/opt/pw-browsers'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://127.0.0.1:5173/' + query + (/^anakin(Dual)?$|dooku|master/.test(sprite) ? '#duel' : ''));
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
const png = await page.evaluate(
  ([sprite, anim, dirsArg, scale]) => {
    const set = __game.assets.sprites[sprite];
    if (!set) throw new Error('no sprite set ' + sprite + ' (have: ' + Object.keys(__game.assets.sprites).join(',') + ')');
    const a = set.anims[anim];
    if (!a) throw new Error('no animation ' + anim + ' (have: ' + Object.keys(set.anims).join(',') + ')');
    const dirs = dirsArg.split(',').map(Number).filter((d) => d < set.dirs);
    const CW = 120;
    const CH = 110;
    const c = document.createElement('canvas');
    c.width = (a.frames * CW + 40) * scale;
    c.height = (dirs.length * CH + 16) * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.scale(scale, scale);
    g.fillStyle = '#3a3f46';
    g.fillRect(0, 0, c.width, c.height);
    g.font = '9px sans-serif';
    g.fillStyle = '#ffd966';
    g.fillText(`${sprite} · ${anim} · ${a.frames}f @ ${a.fps.toFixed(1)} fps · hit ${a.hit ?? '-'}`, 4, 11);
    dirs.forEach((d, row) => {
      g.fillStyle = '#9aa';
      g.fillText('dir ' + d, 4, 16 + row * CH + CH / 2);
      for (let f = 0; f < a.frames; f++) {
        const fr = a.data[d][f];
        const x0 = 40 + f * CW;
        const y0 = 16 + row * CH;
        const ax = x0 + CW / 2;
        const ay = y0 + CH - 22;
        g.fillStyle = f === a.hit ? '#5a3434' : '#474c55';
        g.fillRect(x0 + 1, y0 + 1, CW - 2, CH - 2);
        g.strokeStyle = 'rgba(255,255,255,0.15)';
        g.beginPath();
        g.ellipse(ax, ay, 14, 7, 0, 0, Math.PI * 2);
        g.stroke();
        const k = fr.k || 1;
        if (fr.shadow) {
          g.globalAlpha = 0.75;
          const s = fr.shadow;
          g.drawImage(s.page, s.sx, s.sy, s.w, s.h, ax - s.ox * k, ay - s.oy * k, s.w * k, s.h * k);
          g.globalAlpha = 1;
        }
        g.drawImage(fr.page, fr.sx, fr.sy, fr.w, fr.h, ax - fr.ox * k, ay - fr.oy * k, fr.w * k, fr.h * k);
        // the blade, as the game draws it from the frame's markers
        const b = fr.markers && fr.markers.saberBase;
        const e = fr.markers && fr.markers.saberTip;
        if (b && e) {
          g.strokeStyle = 'rgba(120,180,255,0.95)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(ax + b[0], ay + b[1]);
          g.lineTo(ax + e[0], ay + e[1]);
          g.stroke();
          g.lineWidth = 1;
        }
        g.fillStyle = f === a.hit ? '#ff9a9a' : '#cfd3da';
        g.fillText('#' + f + (f === a.hit ? ' HIT' : ''), x0 + 3, y0 + 10);
      }
    });
    return c.toDataURL('image/png');
  },
  [sprite, anim, dirsArg, +scaleArg],
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
