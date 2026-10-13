// A terrain worker (gfx/terrainPool.js): builds the remastered ground's chunks off the main thread. It is set up
// with the place (its tile maps, rooms and craters) and the ground textures as the page has them, and builds the
// same chunks the page would (gfx/terrain.js), handing each back as an ImageBitmap.
import { Terrain, setFloorTexture, setGroundTextures, setFacilityFloor, setLavaTexture } from './terrain.js';

let T = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    const t = m.tex || {};
    if (t.floor) setFloorTexture(t.floor);
    if (t.ground) setGroundTextures(t.ground);
    setFacilityFloor(t.facility || null);
    setLavaTexture(t.lava || null);
    T = new Terrain(m.world);
    return;
  }
  if (m.type === 'build') {
    const key = m.cx + ',' + m.cy;
    try {
      const c = T.buildChunk(m.cx, m.cy, m.S);
      const bmp = c.canvas.transferToImageBitmap();
      self.postMessage({ key, gen: m.gen, S: m.S, sx: c.sx, sy: c.sy, bmp }, [bmp]);
    } catch (err) {
      self.postMessage({ key, gen: m.gen, S: m.S, error: String((err && err.message) || err) });
    }
  }
};
