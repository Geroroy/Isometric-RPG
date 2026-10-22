// A terrain worker (gfx/terrainPool.js): builds the remastered ground's chunks off the main thread. It is set up
// with the place (its tile maps, rooms and craters) and the ground textures as the page has them, and builds the
// same chunks the page would (gfx/terrain.js), handing each back as an ImageBitmap.
import { Terrain, setFloorTexture, setGroundTextures, setFacilityFloor, setLavaTexture, setPadFloor } from './terrain.js';

let T = null;
let ready = Promise.resolve(); // (a painted ground: its picture fetched before the first chunk)

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    const t = m.tex || {};
    if (t.floor) setFloorTexture(t.floor);
    if (t.ground) setGroundTextures(t.ground);
    setFacilityFloor(t.facility || null);
    setLavaTexture(t.lava || null, t.lavaMetres || 8);
    setPadFloor(t.pad || null);
    const bg = m.world.backdrop;
    ready = bg && bg.url ? fetch(bg.url).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((img) => (bg.img = img)).catch((err) => console.warn('지형 워커: 배경 그림 ' + err.message)) : Promise.resolve();
    ready = ready.then(() => (T = new Terrain(m.world)));
    return;
  }
  if (m.type === 'build') ready.then(() => build(m));
};

function build(m) {
  {
    const key = m.cx + ',' + m.cy;
    try {
      const c = T.buildChunk(m.cx, m.cy, m.S);
      const bmp = c.canvas.transferToImageBitmap();
      self.postMessage({ key, gen: m.gen, S: m.S, sx: c.sx, sy: c.sy, bmp }, [bmp]);
    } catch (err) {
      self.postMessage({ key, gen: m.gen, S: m.S, error: String((err && err.message) || err) });
    }
  }
}
