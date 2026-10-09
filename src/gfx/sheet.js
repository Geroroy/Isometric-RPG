// Character sprite sheets rendered in Blender (tools/sprites/render_sprites.py):
// sheet pages, shadow pages and a JSON of frame rects, foot anchors, saber
// markers and visible blade stretches. Loaded into the same sprite-set shape
// the baker produces, so units draw them like any other set:
//   { dirs, anims: { name: { frames, fps, loop, hit, data: [dir][frame] } } }
// Each frame: { page, sx, sy, w, h, ox, oy, markers, blades?, shadow, k? }.

/** Characters drawn from a sheet instead of being baked at load time. */
export const SHEETS = {
  anakin: 'sprites/anakin_128.json',
};

const loadImg = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('스프라이트 시트를 불러오지 못했습니다: ' + src));
    img.src = src;
  });

/** One sheet's JSON (url relative to the page) -> a sprite set. */
export async function loadSheet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('스프라이트 JSON을 불러오지 못했습니다: ' + url);
  const meta = await res.json();
  const dir = url.replace(/[^/]*$/, '');
  const [pages, shadowPages] = await Promise.all([Promise.all(meta.pages.map((p) => loadImg(dir + p))), Promise.all(meta.shadowPages.map((p) => loadImg(dir + p)))]);
  // sheet px -> game px (1 at the native 128 px size; drawn smoothly otherwise)
  const k = meta.k !== 1 ? meta.k : undefined;
  const anims = {};
  for (const [name, a] of Object.entries(meta.anims)) {
    const data = Array.from({ length: meta.dirs }, () => []);
    for (const row of a.frames) {
      for (let d = 0; d < meta.dirs; d++) {
        const r = row[d];
        const s = r.s;
        const fr = {
          page: pages[r.p],
          sx: r.x,
          sy: r.y,
          w: r.w,
          h: r.h,
          ox: r.ox,
          oy: r.oy,
          markers: r.m || {},
          shadow: { page: shadowPages[s.p], sx: s.x, sy: s.y, w: s.w, h: s.h, ox: s.ox, oy: s.oy },
        };
        if (r.b && Object.keys(r.b).length) fr.blades = r.b;
        if (k) fr.k = fr.shadow.k = k;
        data[d].push(fr);
      }
    }
    anims[name] = { frames: a.frames.length, fps: a.fps, loop: a.loop, hit: a.hit ?? undefined, data };
  }
  return { dirs: meta.dirs, anims, sheet: true };
}

/** Every sheet in SHEETS, by sprite name. */
export async function loadSheets(onProgress) {
  const out = {};
  const names = Object.keys(SHEETS);
  for (let i = 0; i < names.length; i++) {
    onProgress(i / names.length, `스프라이트 시트: ${names[i]}`);
    out[names[i]] = await loadSheet(import.meta.env.BASE_URL + SHEETS[names[i]]);
  }
  return out;
}
