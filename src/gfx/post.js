// Post-processing (ART_GUIDE.md §10): per-place colour grading through a 3D
// LUT, a light bloom, a vignette and fine film grain. The 2D world canvas is
// copied into WebGL each frame and drawn through these passes onto a canvas
// that sits over it (the world canvas stays underneath, invisible, and keeps
// the mouse). Each effect can be switched off in the options; with all off,
// or without WebGL, the world canvas shows as before and nothing here runs.

const STORE = 'cw.post';
export const POST_DEFAULTS = { grade: true, bloom: true, vignette: true, grain: true, fps: false };

/**
 * Grades per place: white balance (gain), contrast round mid-grey, saturation,
 * split toning (added to shadows / highlights), and the bloom amount.
 * Built into a 16³ LUT; kept gentle — the palette is right without them.
 */
export const GRADES = {
  christophsis: { gain: [0.98, 1.0, 1.05], contrast: 1.06, sat: 0.95, shadow: [-0.01, 0.0, 0.03], high: [0.02, 0.015, 0.0], bloom: 0.3 },
  coruscant: { gain: [1.01, 1.0, 0.99], contrast: 1.04, sat: 1.0, shadow: [0.0, 0.0, 0.015], high: [0.015, 0.01, 0.0], bloom: 0.3 },
  undercity: { gain: [0.98, 1.0, 1.04], contrast: 1.1, sat: 0.93, shadow: [-0.015, 0.015, 0.04], high: [0.03, 0.0, 0.02], bloom: 0.5 },
  geonosis: { gain: [1.04, 1.0, 0.92], contrast: 1.08, sat: 0.95, shadow: [0.0, 0.012, -0.01], high: [0.025, 0.015, -0.01], bloom: 0.3 },
  mustafar: { gain: [1.06, 0.97, 0.9], contrast: 1.14, sat: 1.05, shadow: [0.03, -0.01, -0.01], high: [0.04, 0.02, -0.02], bloom: 0.45 },
};

/** Which grade the current place uses. */
export function gradeOf(game) {
  const w = game.world;
  if (w.grade === 'coruscant') return game.player.y > 90 ? 'undercity' : 'coruscant';
  return w.grade || 'christophsis';
}

const N = 16; // LUT size per axis

function buildLut(g) {
  const out = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++)
    for (let gg = 0; gg < N; gg++)
      for (let r = 0; r < N; r++) {
        let c = [r / (N - 1), gg / (N - 1), b / (N - 1)].map((v, i) => v * g.gain[i]);
        c = c.map((v) => (v - 0.5) * g.contrast + 0.5);
        const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        c = c.map((v) => l + (v - l) * g.sat);
        const sh = (1 - Math.min(1, Math.max(0, l))) ** 2;
        const hi = Math.min(1, Math.max(0, l)) ** 2;
        c = c.map((v, i) => v + g.shadow[i] * sh + g.high[i] * hi);
        // the LUT image: N slices of N×N side by side (x = r + b·N, y = g)
        const o = ((gg * N * N) + b * N + r) * 4;
        for (let i = 0; i < 3; i++) out[o + i] = Math.round(Math.min(1, Math.max(0, c[i])) * 255);
        out[o + 3] = 255;
      }
  return out;
}

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS_BRIGHT = `precision mediump float; varying vec2 uv; uniform sampler2D src; uniform vec2 texel;
void main(){
  vec3 c = vec3(0.0);
  c += texture2D(src, uv + texel * vec2(-0.5, -0.5)).rgb; c += texture2D(src, uv + texel * vec2(0.5, -0.5)).rgb;
  c += texture2D(src, uv + texel * vec2(-0.5, 0.5)).rgb;  c += texture2D(src, uv + texel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(0.62, 0.95, l); // only the bright parts: blades, neon, flashes, lava
  gl_FragColor = vec4(c * k, 1.0);
}`;
const FS_BLUR = `precision mediump float; varying vec2 uv; uniform sampler2D src; uniform vec2 dir;
void main(){
  vec3 c = texture2D(src, uv).rgb * 0.227;
  c += (texture2D(src, uv + dir * 1.385).rgb + texture2D(src, uv - dir * 1.385).rgb) * 0.316;
  c += (texture2D(src, uv + dir * 3.231).rgb + texture2D(src, uv - dir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;
const FS_FINAL = `precision mediump float; varying vec2 uv;
uniform sampler2D src; uniform sampler2D bloom; uniform sampler2D lutA; uniform sampler2D lutB;
uniform float mixAB, useLut, bloomK, vig, grain, seed, aspect;
vec3 lut(sampler2D t, vec3 c){
  float n = ${N.toFixed(1)};
  float b = c.b * (n - 1.0);
  float b0 = floor(b); float b1 = min(b0 + 1.0, n - 1.0);
  vec2 rg = (vec2(c.r, c.g) * (n - 1.0) + 0.5) / vec2(n * n, n);
  vec3 a = texture2D(t, rg + vec2(b0 / n, 0.0)).rgb;
  vec3 d = texture2D(t, rg + vec2(b1 / n, 0.0)).rgb;
  return mix(a, d, b - b0);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
void main(){
  vec3 c = texture2D(src, uv).rgb;
  c += texture2D(bloom, uv).rgb * bloomK;
  c = clamp(c, 0.0, 1.0);
  if (useLut > 0.5) c = mixAB < 1.0 ? mix(lut(lutA, c), lut(lutB, c), mixAB) : lut(lutB, c); // one LUT once the cross-fade is over
  vec2 q = (uv - 0.5) * vec2(aspect, 1.0);
  c *= 1.0 - vig * smoothstep(0.35, 1.05, length(q) * 1.15);
  c += (hash(gl_FragCoord.xy) - 0.5) * grain;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(world, game) {
    this.world = world; // the 2D canvas the renderer draws
    this.game = game;
    this.opts = { ...POST_DEFAULTS };
    try {
      Object.assign(this.opts, JSON.parse(localStorage.getItem(STORE) || '{}'));
    } catch {}
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'post';
    world.after(this.canvas);
    this.ok = this.init();
    this.grade = null;
    this.prevLut = null;
    this.mixT = 1;
    this.ms = 0; // CPU time of the last frame's passes, for the FPS readout
    this.apply();
  }

  init() {
    const gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false });
    if (!gl) return false;
    this.gl = gl;
    const prog = (fs) => {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i).name;
        u[name] = gl.getUniformLocation(p, name);
      }
      return { p, u };
    };
    try {
      this.pBright = prog(FS_BRIGHT);
      this.pBlur = prog(FS_BLUR);
      this.pFinal = prog(FS_FINAL);
    } catch (e) {
      console.warn('post-processing off:', e.message);
      return false;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = (filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.src = this.tex(gl.NEAREST);
    this.lutA = this.tex(gl.LINEAR);
    this.lutB = this.tex(gl.LINEAR);
    this.fbos = [0, 1].map(() => ({ tex: this.tex(gl.LINEAR), fb: gl.createFramebuffer(), w: 0, h: 0 }));
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ok = false;
      this.apply();
    });
    return true;
  }

  /** Any effect on (and WebGL working)? */
  get active() {
    return this.ok && (this.opts.grade || this.opts.bloom || this.opts.vignette || this.opts.grain);
  }

  set(key, on) {
    this.opts[key] = on;
    try {
      localStorage.setItem(STORE, JSON.stringify(this.opts));
    } catch {}
    this.apply();
  }

  /** Show the post canvas over the world canvas, or get out of the way. */
  apply() {
    const on = this.active;
    this.canvas.style.display = on ? '' : 'none';
    this.world.style.opacity = on ? '0' : '';
  }

  uploadLut(tex, name) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N * N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLut(GRADES[name]));
  }

  sizeFbo(f, w, h) {
    if (f.w === w && f.h === h) return;
    const gl = this.gl;
    f.w = w;
    f.h = h;
    gl.bindTexture(gl.TEXTURE_2D, f.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
  }

  /** The FPS readout (options → 화면 효과): average over the last second. */
  meter(dt) {
    const m = (this.fpsM ||= { t: 0, n: 0, worst: 0, el: null });
    if (!this.opts.fps) {
      if (m.el) m.el.style.display = 'none';
      return;
    }
    if (!m.el) {
      m.el = document.createElement('div');
      m.el.id = 'fps';
      document.body.append(m.el);
    }
    m.el.style.display = '';
    m.t += dt;
    m.n++;
    m.worst = Math.max(m.worst, dt);
    if (m.t >= 1) {
      m.el.textContent = `FPS ${Math.round(m.n / m.t)}  최저 ${Math.round(1 / m.worst)}\n후처리 ${this.active ? this.ms.toFixed(1) + ' ms' : '꺼짐'}`;
      m.t = m.n = m.worst = 0;
    }
  }

  render(dt) {
    this.meter(dt);
    if (!this.active) return;
    const t0 = performance.now();
    const gl = this.gl;
    const W = this.world.width;
    const H = this.world.height;
    const c = this.canvas;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    if (c.style.width !== this.world.style.width) c.style.width = this.world.style.width;
    if (c.style.height !== this.world.style.height) c.style.height = this.world.style.height;
    // the place's grade, cross-faded over a second when it changes
    const g = gradeOf(this.game);
    if (g !== this.grade) {
      if (this.grade) {
        [this.lutA, this.lutB] = [this.lutB, this.lutA]; // the old one becomes A
        this.uploadLut(this.lutB, g);
        this.mixT = 0;
      } else {
        this.uploadLut(this.lutA, g);
        this.uploadLut(this.lutB, g);
        this.mixT = 1;
      }
      this.grade = g;
    }
    this.mixT = Math.min(1, this.mixT + dt);
    const G = GRADES[g];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.world);
    // bloom: bright parts at half size, blurred across and down
    const bloom = this.opts.bloom;
    if (bloom) {
      const [a, b] = this.fbos;
      const w2 = Math.max(1, W >> 1);
      const h2 = Math.max(1, H >> 1);
      this.sizeFbo(a, w2, h2);
      this.sizeFbo(b, w2, h2);
      gl.viewport(0, 0, w2, h2);
      gl.useProgram(this.pBright.p);
      gl.uniform1i(this.pBright.u.src, 0);
      gl.uniform2f(this.pBright.u.texel, 1 / W, 1 / H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(this.pBlur.p);
      gl.uniform1i(this.pBlur.u.src, 0);
      for (let pass = 0; pass < 2; pass++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform2f(this.pBlur.u.dir, 1.4 / w2, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.uniform2f(this.pBlur.u.dir, 0, 1.4 / h2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const P = this.pFinal;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[0].tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lutA);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lutB);
    gl.uniform1i(P.u.src, 0);
    gl.uniform1i(P.u.bloom, 1);
    gl.uniform1i(P.u.lutA, 2);
    gl.uniform1i(P.u.lutB, 3);
    gl.uniform1f(P.u.mixAB, this.mixT);
    gl.uniform1f(P.u.useLut, this.opts.grade ? 1 : 0);
    gl.uniform1f(P.u.bloomK, bloom ? G.bloom : 0);
    gl.uniform1f(P.u.vig, this.opts.vignette ? 0.26 : 0);
    gl.uniform1f(P.u.grain, this.opts.grain ? 0.035 : 0);
    gl.uniform1f(P.u.seed, (performance.now() % 1000) * 0.001);
    gl.uniform1f(P.u.aspect, W / H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    this.ms = performance.now() - t0;
  }
}
