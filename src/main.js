// Entry point: bake sprites, build the world, then run the game loop.
import './style.css';
import { applySkin } from './ui/skin.js';
import { bakeAssets, bakeDuelAssets } from './gfx/assets.js';
import { DuelHUD } from './ui/duelHud.js';
import { Game } from './game/game.js';
import { Renderer } from './gfx/renderer.js';
import { Portrait } from './gfx/portrait.js';
import { HUD } from './ui/hud.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { TouchControls, isTouchDevice, hasMouse } from './ui/touch.js';
import { Fullscreen } from './ui/fullscreen.js';
import { ZoomControl } from './ui/zoom.js';
import { PortraitPhoto } from './ui/portraitPhoto.js';
import { DialogueUI } from './ui/dialogue.js';
import { startDialogue } from './game/dialogue.js';

applySkin();
const loading = document.getElementById('loading');
const bar = document.querySelector('#loading .bar div');
const label = document.querySelector('#loading .label');

// '#duel' selects the Movie Duel (a hash works on any host); switching reloads
const MODE = location.hash === '#duel' ? 'duel' : 'campaign';
window.addEventListener('hashchange', () => location.reload());

const DUEL_HELP = `
  <div class="help-kicker">MOVIE DUEL · EPISODE II</div>
  <h1 class="help-title">지오노시스의 결투</h1>
  <div class="help-sub">두쿠 백작의 비밀 격납고 · 아나킨 vs 두쿠</div>
  <nav class="title-menu">
    <button id="startBtn" class="tm-btn" type="button"><i></i><span>결투 시작</span></button>
    <a id="modeLink" class="tm-btn" href="#campaign"><i></i><span>캠페인으로</span></a>
    <button id="controlsBtn" class="tm-btn" type="button"><i></i><span>조작법</span></button>
  </nav>
  <p class="help-intro">오비완이 쓰러졌다. 탈출하려는 <b>두쿠 백작</b>을 막아설 수 있는 건 이제 아나킨뿐이다. 우클릭(폰: 막기)으로 막고, 공격이 닿기 직전에 막으면 완벽한 흘리기. 영화와는 다른 결말을 써 보십시오.</p>`;

async function boot() {
  document.querySelector('.title-art').style.backgroundImage = 'url(portrait/anakin.jpg)';
  if (MODE === 'duel') {
    document.querySelector('#help .help-box').innerHTML = DUEL_HELP;
    document.body.classList.add('duel');
  }
  const onProgress = (k, text) => {
    bar.style.width = Math.round(k * 100) + '%';
    label.textContent = text;
  };
  const assets = await bakeAssets(onProgress);
  if (MODE === 'duel') Object.assign(assets.sprites, (await bakeDuelAssets(onProgress)).sprites);
  label.textContent = MODE === 'duel' ? '지오노시스 격납고 준비 중…' : '크리스토프시스 외곽 지형 생성 중…';
  await new Promise((r) => setTimeout(r, 20));

  const audio = new Audio();
  const game = new Game(assets, audio, MODE);
  const canvas = document.getElementById('world');
  const overlay = document.getElementById('overlay');
  const renderer = new Renderer(game, assets, canvas, overlay);
  const portrait = new Portrait();
  const photo = new PortraitPhoto(portrait);
  await photo.init();
  const hud = new HUD(game, renderer, portrait, audio, photo);
  const dialogue = new DialogueUI(game, audio, startDialogue, renderer);
  const input = new Input(game, renderer, hud, audio, canvas);
  input.dialogue = dialogue;
  const duelHud = game.duel ? new DuelHUD(game) : null;
  const touch = new TouchControls(game, renderer, hud, input, audio);
  const fullscreen = new Fullscreen();
  input.onFullscreen = () => fullscreen.toggle();
  const zoom = new ZoomControl(renderer, touch);
  input.onZoom = (dir) => (dir === 0 ? zoom.reset() : zoom.step(dir));
  touch.onEnable = () => zoom.restore();

  const measure = () => {
    renderer.resize();
    // keep Anakin centred in the part of the screen above the console
    renderer.consoleH = document.querySelector('.console').offsetHeight;
    document.documentElement.style.setProperty('--console-h', renderer.consoleH + 'px');
  };
  window.addEventListener('resize', measure);
  // Controls follow the device actually used: a tablet with a Bluetooth mouse
  // plays like a PC, touching the screen switches back to the touch UI.
  if (isTouchDevice() && !hasMouse()) touch.enable();
  else zoom.restore();
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse') touch.disable();
      else if (e.pointerType === 'touch') touch.enable();
    },
    { capture: true, passive: true },
  );
  measure();

  // warm up visible terrain chunks before revealing the game
  renderer.render(0);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);

  const help = document.getElementById('help');
  const startBtn = document.getElementById('startBtn');
  const controls = document.getElementById('controls');
  document.getElementById('controlsBtn').onclick = () => controls.classList.remove('hidden');
  controls.querySelector('.ct-close').onclick = () => controls.classList.add('hidden');
  let started = false;
  startBtn.onclick = (e) => {
    e.stopPropagation();
    help.classList.add('hidden');
    controls.classList.add('hidden');
    if (started) return; // reopened with F1 / HELP: just resume
    started = true;
    startBtn.querySelector('span').textContent = '계속';
    audio.unlock();
    // phones and tablets go fullscreen right away; on PC use the button or F
    if (isTouchDevice()) fullscreen.enter();
    audio.play('ignite');
    // let a user sound bank finish loading so the opening line can be voiced
    if (game.duel) game.duel.start();
    else Promise.race([audio.bankReady, new Promise((r) => setTimeout(r, 1500))]).then(() => game.say('intro'));
  };

  window.__game = game; // handy for debugging in the console
  window.__renderer = renderer;
  window.__hud = hud;
  window.__dialogue = dialogue;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.update(dt);
    touch.update(dt);
    // menus pause the action (the map does not)
    const paused = !help.classList.contains('hidden') || hud.open.tree || hud.open.char || hud.open.settings || hud.open.cards || dialogue.isOpen;
    if (!paused) game.update(dt);
    renderer.render(dt);
    hud.update(dt);
    dialogue.update(dt);
    if (duelHud) duelHud.update(dt);
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
