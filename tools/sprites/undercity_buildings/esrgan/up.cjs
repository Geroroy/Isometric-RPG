// node up.cjs in.png out.png [scale=4] [model_dir]: an RGB image through ESRGAN (UpscalerJS's converted
// weights, from npm — no other download), patch by patch on the CPU (tfjs-node). The default is the
// GAN-trained 4x model of @upscalerjs/esrgan-legacy: it draws crisp edges and panel detail where a
// resampler only blurs. Used by tools/sprites/undercity_buildings/upscale.py.
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');
const [, , inp, outp, sc = '4', modelDir = ''] = process.argv;
const S = +sc;
class MultiplyBeta extends tf.layers.Layer {
  constructor() { super({}); this.beta = 0.2; }
  call(inputs) { return tf.mul(Array.isArray(inputs) ? inputs[0] : inputs, this.beta); }
  static get className() { return 'MultiplyBeta'; }
}
class PixelShuffle extends tf.layers.Layer {
  constructor() { super({}); }
  computeOutputShape(s) { return [s[0], s[1], s[2], 3]; }
  call(inputs) { return tf.depthToSpace(Array.isArray(inputs) ? inputs[0] : inputs, S, 'NHWC'); }
  static get className() { return `PixelShuffle${S}x`; }
}
tf.serialization.registerClass(MultiplyBeta);
tf.serialization.registerClass(PixelShuffle);
(async () => {
  const dir = modelDir || path.join(__dirname, 'node_modules/@upscalerjs/esrgan-legacy/models/gans');
  const model = await tf.loadLayersModel(tf.io.fileSystem(path.join(dir, 'model.json')));
  const img = tf.node.decodeImage(fs.readFileSync(inp), 3).toFloat().div(255);
  const [H, W] = img.shape;
  const P = 96, PAD = 8;
  const out = tf.buffer([H * S, W * S, 3], 'float32');
  const t0 = Date.now();
  for (let y = 0; y < H; y += P)
    for (let x = 0; x < W; x += P) {
      const y0 = Math.max(0, y - PAD), x0 = Math.max(0, x - PAD);
      const y1 = Math.min(H, y + P + PAD), x1 = Math.min(W, x + P + PAD);
      const res = tf.tidy(() => model.predict(img.slice([y0, x0, 0], [y1 - y0, x1 - x0, 3]).expandDims(0)).squeeze());
      const d = await res.data();
      const rw = (x1 - x0) * S;
      for (let yy = y; yy < Math.min(H, y + P); yy++)
        for (let xx = x; xx < Math.min(W, x + P); xx++)
          for (let sy = 0; sy < S; sy++)
            for (let sx = 0; sx < S; sx++) {
              const oy = (yy - y0) * S + sy, ox = (xx - x0) * S + sx;
              const i = (oy * rw + ox) * 3;
              for (let c = 0; c < 3; c++) out.set(d[i + c], yy * S + sy, xx * S + sx, c);
            }
      res.dispose();
    }
  const t = tf.clipByValue(out.toTensor().mul(255), 0, 255).round().toInt();
  fs.writeFileSync(outp, await tf.node.encodePng(t));
  console.log(path.basename(inp), [H, W], '->', [H * S, W * S], ((Date.now() - t0) / 1000).toFixed(1) + 's');
})();
