// What the world needs to know about each Coruscant undercity sprite
// (gfx/citySprites.js): its collision footprint (from the sprite's JSON), the
// lights it throws, where steam leaves it, the sound it makes, and for the
// billboard the frame its hologram fills. Offsets are world tiles from the
// prop's origin (its ground centre); z in tiles up.

export const SHEET_PROPS = {
  cantina: {
    lights: [
      [0.4, 3.9, 1.0, 255, 160, 80, 150, 0.06], // the doorway's spill
      [0.4, 3.2, 3.9, 255, 90, 160, 90, 0.18], // the round sign
      [3.4, -1.1, 2.6, 80, 230, 220, 60, 0.12], // the glyph board's tube
      [2.6, -0.4, 4.6, 255, 190, 120, 70, 0.08], // balcony lamps
    ],
    steam: [[-2.0, -1.6, 6.9], [-0.4, -2.2, 6.9], [1.0, -1.2, 6.9]],
    sound: { name: 'cantina', at: [0.4, 3.4], rad: 16, vol: 1 },
  },
  tenement0: { lights: [[2.1, 2.1, 5, 255, 70, 210, 80, 0.2]], steam: [] },
  tenement1: { lights: [[2.1, 2.1, 5, 80, 230, 255, 80, 0.2]], steam: [] },
  tenement2: { lights: [[2.1, 2.1, 5, 255, 180, 70, 80, 0.2]], steam: [] },
  stall0: { lights: [[0.6, 0.4, 1.7, 255, 180, 100, 50, 0.08]], vendor: [0, 1.0] },
  stall1: { lights: [[0.6, 0.4, 1.7, 255, 180, 100, 50, 0.08]], vendor: [0, 1.0] },
  stall2: { lights: [[0.6, 0.4, 1.7, 255, 180, 100, 50, 0.08]], vendor: [0, 1.0] },
  // the hologram: a panel facing the camera (along world x − y), drawn by the renderer
  billboard: { holo: { x: 0.1, y: 0.1, z0: 3.0, z1: 4.6, hw: 1.3 }, lights: [[0.1, 0.1, 3.8, 120, 220, 255, 90, 0.1]] },
  speeder0: { bob: 1.2, lights: [[0, 0, 0.1, 80, 160, 255, 34, 0.05]] },
  speeder1: { bob: 1.2, lights: [[0, 0, 0.1, 80, 160, 255, 34, 0.05]] },
  crates: {},
  barrels: {},
  ventGrate: { flat: true, steam: [[0, 0, 0.1]], sound: { name: 'steam', at: [0, 0], rad: 6, vol: 0.6 }, lights: [[0, 0, 0.1, 255, 110, 50, 40, 0.1]] },
  droidParts: {},
  trashBin: {},
  junctionBox: { lights: [[0.3, 0, 1.1, 120, 255, 140, 24, 0.3]] },
};

let FOOTPRINTS = {};

/** The sprites' collision outlines (tiles from the origin), once they are loaded. */
export function setCityFootprints(city) {
  FOOTPRINTS = Object.fromEntries(Object.entries(city).filter(([, v]) => v.meta).map(([k, v]) => [k, v.meta.footprint]));
}

export const cityFootprint = (name) => FOOTPRINTS[name] || null;

export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
