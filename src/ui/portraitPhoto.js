// Portrait photo source. Priority:
//   1. a photo the player picked in Settings (kept only on this device)
//   2. a photo deployed with the game at portrait/anakin.(jpg|png|webp)
//   3. none → the pixel-art portrait
// The picked photo is downscaled and stored as a JPEG data URL in
// localStorage together with its crop (focus point + zoom).

const KEY = 'cw.portrait';
const DEPLOYED = ['portrait/anakin.jpg', 'portrait/anakin.png', 'portrait/anakin.webp'];
const MAX_SIDE = 720;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export class PortraitPhoto {
  constructor(portrait) {
    this.portrait = portrait;
    this.source = 'pixel'; // 'pixel' | 'local' | 'deployed'
  }

  async init() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      saved = null;
    }
    if (saved && saved.src) {
      try {
        this.portrait.setPhoto(await loadImage(saved.src), saved.crop);
        this.source = 'local';
        return;
      } catch {
        /* fall through */
      }
    }
    for (const src of DEPLOYED) {
      try {
        this.portrait.setPhoto(await loadImage(src));
        this.source = 'deployed';
        return;
      } catch {
        /* not deployed */
      }
    }
  }

  /** Read a user-picked image file, downscale it, store it and apply it. */
  async fromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const src = c.toDataURL('image/jpeg', 0.9);
      const small = await loadImage(src);
      const crop = { x: 0.5, y: 0.25, zoom: 2 }; // suits head-and-shoulders and full-body shots
      this.portrait.setPhoto(small, crop);
      this.source = 'local';
      this.save(src, crop);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  save(src, crop) {
    try {
      const cur = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      localStorage.setItem(KEY, JSON.stringify({ src: src ?? cur.src, crop: crop ?? this.portrait.crop }));
      return true;
    } catch {
      return false; // storage full or blocked: the photo still applies for this session
    }
  }

  setCrop(crop) {
    this.portrait.crop = { ...this.portrait.crop, ...crop };
    if (this.source === 'local') this.save(null, this.portrait.crop);
  }

  async reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    this.portrait.clearPhoto();
    this.source = 'pixel';
    await this.init(); // a deployed photo may still apply
  }
}
