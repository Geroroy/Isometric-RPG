// Exports one of the game's prop models (src/gfx/models/props.js) to .glb for
// the Blender sprite pipeline. Glowing parts (MeshBasicMaterial) export as
// unlit materials; the building renderer treats those as neon.
//   node tools/sprites/export_prop_glb.mjs underBlock 0 tools/sprites/out/underBlock_0.glb
import fs from 'node:fs';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildPropVariants } from '../../src/gfx/models/props.js';

// GLTFExporter reads its binary output through FileReader (not in Node)
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend && this.onloadend();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64');
      this.onloadend && this.onloadend();
    });
  }
};

const [name = 'underBlock', variant = '0', out = `tools/sprites/out/${name}_${variant}.glb`] = process.argv.slice(2);
const model = buildPropVariants(name)[+variant];
model.name = name;
const glb = await new GLTFExporter().parseAsync(model, { binary: true });
fs.mkdirSync(out.replace(/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out} (${(glb.byteLength / 1024).toFixed(0)} KB)`);
