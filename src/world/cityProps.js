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
  // street food (serving towards +y; the `_r` sprites are turned to serve towards +x)
  cartHotdog: { lights: [[0.05, 0.3, 2.1, 255, 200, 130, 46, 0.06]], steam: [[-0.45, 0, 1.1], [0.45, 0, 1.1]], vendor: [-1.35, 0.1] },
  grillTrike: { lights: [[-0.45, 0, 1.0, 255, 120, 40, 60, 0.2]], steam: [[-0.45, -0.1, 1.15], [-0.95, -0.28, 2.0]], vendor: [0.2, 0.95], sound: { name: 'steam', at: [-0.45, 0], rad: 5, vol: 0.35 } },
  roundKiosk: { lights: [[0, 0, 1.1, 255, 200, 140, 70, 0.05], [0, 0, 1.6, 110, 255, 150, 50, 0.12]] },
  tableSet: {},
  yatai: { lights: [[-0.95, 0.55, 1.9, 255, 90, 60, 50, 0.1], [0.95, 0.55, 1.9, 255, 90, 60, 50, 0.1]], steam: [[-0.45, 0.05, 1.3]], vendor: [1.35, 0.25] },
  containerKiosk: { lights: [[-0.1, 1.2, 1.2, 255, 180, 100, 90, 0.05]], steam: [[0.5, 0.4, 1.0]], vendor: [1.75, 0.95] },
  containerKiosk2: { lights: [[-0.1, 1.2, 1.2, 255, 180, 100, 90, 0.05]], steam: [[0.5, 0.4, 1.0]], vendor: [1.75, 0.95] },
  foodTruck: { lights: [[-0.5, 1.0, 1.3, 255, 190, 120, 80, 0.05]], steam: [[-0.9, 0, 2.1]], vendor: [-1.75, 1.0] },
  stackShop: { lights: [[-0.2, 1.1, 0.8, 255, 200, 130, 100, 0.05], [1.6, 0.85, 2.0, 80, 230, 255, 60, 0.15]], vendor: [-0.2, 1.35] },
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

// a sprite rendered turned 90° (`NAME_r`): what faced +y faces +x, so every
// offset (x, y) becomes (y, −x)
const turn = ([x, y, ...rest]) => [y, -x, ...rest];
for (const n of ['cartHotdog', 'grillTrike', 'yatai', 'containerKiosk', 'foodTruck']) {
  const d = SHEET_PROPS[n];
  SHEET_PROPS[n + '_r'] = {
    ...d,
    lights: d.lights && d.lights.map(turn),
    steam: d.steam && d.steam.map(turn),
    vendor: d.vendor && turn(d.vendor),
    sound: d.sound && { ...d.sound, at: turn(d.sound.at) },
  };
}

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
