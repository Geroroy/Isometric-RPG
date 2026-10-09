// Entry point: bake sprites, build the world, then run the game loop.
import 'galmuri/dist/galmuri.css';
import './style.css';
import { bakeAssets } from './gfx/assets.js';
import { Game } from './game/game.js';
import { Renderer } from './gfx/renderer.js';
import { Portrait } from './gfx/portrait.js';
import { HUD } from './ui/hud.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { TouchControls, isTouchDevice } from './ui/touch.js';
import { Fullscreen } from './ui/fullscreen.js';
import { ZoomControl } from './ui/zoom.js';

const loading = document.getElementById('loading');
const bar = document.querySelector('#loading .bar div');
const label = document.querySelector('#loading .label');

async function boot() {
  const assets = await bakeAssets((k, text) => {
    bar.style.width = Math.round(k * 100) + '%';
    label.textContent = text;
  });
  label.textContent = '크리스토프시스 외곽 지형 생성 중…';
  await new Promise((r) => setTimeout(r, 20));

  const audio = new Audio();
  const game = new Game(assets, audio);
  const canvas = document.getElementById('world');
  const overlay = document.getElementById('overlay');
  const renderer = new Renderer(game, assets, canvas, overlay);
  const portrait = new Portrait();
  const hud = new HUD(game, renderer, portrait, audio);
  const input = new Input(game, renderer, hud, audio, canvas);
  const touch = new TouchControls(game, renderer, hud, input, audio);
  const fullscreen = new Fullscreen();
  input.onFullscreen = () => fullscreen.toggle();
  const zoom = new ZoomControl(renderer, touch);
  input.onZoom = (dir) => (dir === 0 ? zoom.reset() : zoom.step(dir));
  touch.onEnable = () => zoom.restore();

  const measure = () => {
    renderer.resize();
    // on phones the HUD floats over the world instead of a bottom console
    renderer.consoleH = touch.enabled ? 0 : document.getElementById('console').offsetHeight;
  };
  window.addEventListener('resize', measure);
  if (isTouchDevice()) touch.enable();
  else zoom.restore();
  window.addEventListener('touchstart', () => touch.enable(), { once: true, passive: true });
  measure();

  // warm up visible terrain chunks before revealing the game
  renderer.render(0);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);

  const help = document.getElementById('help');
  const startBtn = document.getElementById('startBtn');
  startBtn.onclick = (e) => {
    e.stopPropagation();
    help.classList.add('hidden');
    audio.unlock();
    // phones go fullscreen (and landscape) right away; on PC use the button or F
    if (touch.enabled) fullscreen.enter();
    audio.play('ignite');
    // let a user sound bank finish loading so the opening line can be voiced
    Promise.race([audio.bankReady, new Promise((r) => setTimeout(r, 1500))]).then(() => game.say('intro'));
  };

  window.__game = game; // handy for debugging in the console
  window.__renderer = renderer;
  window.__hud = hud;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.update(dt);
    touch.update(dt);
    if (help.classList.contains('hidden') || !help.dataset.pause) game.update(dt);
    renderer.render(dt);
    hud.update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__ready = true;
}

// Offline cache / installable app (only on a real web host, never in dev).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  label.textContent = '오류: ' + err.message;
});
