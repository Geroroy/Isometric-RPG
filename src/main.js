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
  const portrait = new Portrait(assets.baker);
  const hud = new HUD(game, renderer, portrait, audio);
  const input = new Input(game, renderer, hud, audio, canvas);

  const measure = () => {
    renderer.resize();
    renderer.consoleH = document.getElementById('console').offsetHeight;
  };
  window.addEventListener('resize', measure);
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
    audio.play('ignite');
    game.say('intro');
  };

  window.__game = game; // handy for debugging in the console
  window.__renderer = renderer;
  window.__hud = hud;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.update(dt);
    if (help.classList.contains('hidden') || !help.dataset.pause) game.update(dt);
    renderer.render(dt);
    hud.update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__ready = true;
}

boot().catch((err) => {
  console.error(err);
  label.textContent = '오류: ' + err.message;
});
