// Entry point: bake sprites, build the world, then run the game loop.
import './style.css';
import { applySkin } from './ui/skin.js';
import { bakeAssets, bakeDuelAssets, bakeSkin, CHARACTERS } from './gfx/assets.js';
import { loadSheets } from './gfx/sheet.js';
import { loadCitySprites } from './gfx/citySprites.js';
import { setCityFootprints } from './world/cityProps.js';
import { setFloorTexture } from './gfx/terrain.js';
import { savedLook } from './ui/appearance.js';
import { iconURL } from './ui/icons.js';
import { DuelHUD } from './ui/duelHud.js';
import { Game } from './game/game.js';
import { Renderer } from './gfx/renderer.js';
import { Post } from './gfx/post.js';
import { Portrait } from './gfx/portrait.js';
import { HUD } from './ui/hud.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Music } from './core/music.js';
import { Speech } from './core/speech.js';
import { Ambience } from './core/ambience.js';
import { JukeboxUI } from './ui/jukebox.js';
import { DebugUI } from './ui/debug.js';
import { TouchControls, isTouchDevice, hasMouse } from './ui/touch.js';
import { Fullscreen } from './ui/fullscreen.js';
import { ZoomControl } from './ui/zoom.js';
import { PortraitPhoto } from './ui/portraitPhoto.js';
import { DialogueUI } from './ui/dialogue.js';
import { CinemaUI } from './ui/cinemaUI.js';
import { startDialogue } from './game/dialogue.js';

applySkin();
const loading = document.getElementById('loading');
const bar = document.querySelector('#loading .bar div');
const label = document.querySelector('#loading .label');

// '#duel' / '#duel-mustafar' select a Movie Duel (a hash works on any host); switching reloads
const DUEL = location.hash === '#duel' ? 'geonosis' : location.hash === '#duel-mustafar' ? 'mustafar' : null;
const MODE = DUEL ? 'duel' : 'campaign';
window.addEventListener('hashchange', () => location.reload());

const DUEL_TITLES = {
  geonosis: ['#duel', '지오노시스의 결투', 'MOVIE DUEL · EPISODE II — 지오노시스의 결투 · 두쿠 백작의 비밀 격납고', '지오노시스 격납고 준비 중…'],
  mustafar: ['#duel-mustafar', '무스타파의 결투', 'MOVIE DUEL · EPISODE III — 무스타파의 결투 · 아나킨 vs 오비완', '무스타파 채굴 시설 준비 중…'],
};
const duelMenu = (d) => {
  const other = d === 'geonosis' ? 'mustafar' : 'geonosis';
  return `
  <button id="startBtn" class="tm-item sel" type="button"><span>결투 시작</span></button>
  <a class="tm-item" href="${DUEL_TITLES[other][0]}"><span>다른 결투</span><small>${DUEL_TITLES[other][1]}</small></a>
  <a id="modeLink" class="tm-item" href="#campaign"><span>캠페인으로</span><small>크리스토프시스 외곽</small></a>
  <button id="controlsBtn" class="tm-item" type="button"><span>조작법</span></button>`;
};

async function boot() {
  document.querySelector('.title-crest').src = iconURL('command');
  if (MODE === 'duel') {
    document.querySelector('.title-menu').innerHTML = duelMenu(DUEL);
    document.querySelector('.title-legal').innerHTML = `${DUEL_TITLES[DUEL][2]}<br />비상업 팬 프로젝트. STAR WARS © &amp; ™ LUCASFILM LTD. 모든 권리는 각 권리자에게 있습니다.`;
    document.body.classList.add('duel');
  }
  const onProgress = (k, text) => {
    bar.style.width = Math.round(k * 100) + '%';
    label.textContent = text;
  };
  const assets = await bakeAssets(onProgress);
  // characters rendered in Blender: sprite sheet + frame JSON (after the bake
  // has been cached — the cache stores baked canvases only)
  Object.assign(assets.sprites, await loadSheets(Object.keys(CHARACTERS), onProgress));
  // the Coruscant undercity's Blender-rendered buildings and street
  if (MODE === 'campaign') {
    assets.city = await loadCitySprites(onProgress);
    setCityFootprints(assets.city);
    setFloorTexture(assets.city.floor);
  }
  if (MODE === 'duel') Object.assign(assets.sprites, (await bakeDuelAssets(onProgress, DUEL)).sprites);
  // the equipped appearance (the Movie Duel keeps the default look)
  const look = MODE === 'campaign' ? savedLook() : null;
  if (look && !assets.sprites[look.sprite]) assets.sprites[look.sprite] = await bakeSkin(look.sprite, (k) => onProgress(k, '외형 준비 중…'));
  label.textContent = MODE === 'duel' ? DUEL_TITLES[DUEL][3] : '코러산트 · 크리스토프시스 생성 중…';
  await new Promise((r) => setTimeout(r, 20));

  const audio = new Audio();
  const speech = (audio.speech = new Speech(audio));
  const game = new Game(assets, audio, MODE, DUEL || undefined);
  // Anakin's voice: barks, duel lines, cutscene subtitles and dialogue replies
  const ANAKIN = '아나킨';
  game.on('say', (text, key, dur, speaker) => {
    if (dur == null && (!speaker || speaker === ANAKIN)) speech.anakin(text); // dur: a recorded clip already played
  });
  game.on('subtitle', (who, text) => {
    if (!who) speech.stop();
    else if (who === ANAKIN && !(game.cinema && game.cinema.track)) speech.anakin(text); // a film track carries its own voices
  });
  game.on('reply', (text) => speech.anakin(text));
  // the city hub ⇄ Christophsis: new ground, props and map
  game.on('world', () => {
    renderer.setWorld();
    hud.onWorld();
  });
  if (look) game.player.sprite = look.sprite;
  const canvas = document.getElementById('world');
  const overlay = document.getElementById('overlay');
  const renderer = (game.renderer = new Renderer(game, assets, canvas, overlay));
  const post = (renderer.post = new Post(canvas, game)); // LUT, bloom, vignette, grain (options)
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
  // music starts with the first touch / key (browsers block autoplay)
  const music = (game.music = new Music(audio));
  const ambience = new Ambience(audio);
  new CinemaUI(game);
  game.on('cinema', (on) => on || zoom.restore()); // back to the player's zoom after a cutscene
  const jukebox = (hud.jukeUI = new JukeboxUI(hud, music, audio));
  hud.debugUI = new DebugUI(hud, game, music, audio);
  game.on('jukebox', () => setTimeout(() => hud.toggle('juke', true), 0)); // after the dialogue closes
  music.onUnlock = (url) => {
    const c = music.catalog.find((x) => x.url === url);
    if (c && !document.body.classList.contains('title')) hud.log(`♪ 칸티나 주크박스에 추가: ${c.title}`, 'gold');
  };
  const wake = () => {
    audio.unlock();
    music.init(game, () => !help.classList.contains('hidden'));
  };
  window.addEventListener('pointerdown', wake, { once: true, capture: true });
  window.addEventListener('keydown', wake, { once: true, capture: true });
  const startBtn = document.getElementById('startBtn');
  const controls = document.getElementById('controls');
  document.getElementById('controlsBtn').onclick = () => controls.classList.remove('hidden');
  controls.querySelector('.ct-close').onclick = () => controls.classList.add('hidden');
  // main menu after Jedi: Survivor: one item is selected at a time (hover,
  // arrow keys or W/S), Enter / Space activates it
  const items = [...document.querySelectorAll('.tm-item')];
  let sel = 0;
  const select = (i) => {
    sel = (i + items.length) % items.length;
    items.forEach((b, k) => b.classList.toggle('sel', k === sel));
  };
  items.forEach((b, i) => {
    b.addEventListener('pointerenter', () => select(i));
    b.addEventListener('focus', () => select(i));
  });
  window.addEventListener(
    'keydown',
    (e) => {
      if (help.classList.contains('hidden') || !controls.classList.contains('hidden')) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') select(sel - 1);
      else if (k === 'arrowdown' || k === 's') select(sel + 1);
      else if (k === 'enter' || k === ' ') items[sel].click();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
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
  window.__music = music;
  let last = performance.now();
  let titleT = 0;
  const reported = new Set();
  const loop = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // the first frame can stamp before `last`
    last = now;
    input.update(dt);
    touch.update(dt);
    // the title screen sits over the live world: hide the HUD, drift the camera
    const onTitle = !help.classList.contains('hidden');
    if (onTitle !== document.body.classList.contains('title')) {
      document.body.classList.toggle('title', onTitle);
      if (!onTitle) zoom.restore(); // back to the player's own zoom
    }
    if (onTitle && renderer.zoom !== 0.6) renderer.setZoom(0.6); // a wider, cinematic shot
    titleT += dt;
    const dr = renderer.drift;
    const tx = onTitle ? Math.sin(titleT * 0.05) * 150 : 0;
    const ty = onTitle ? Math.sin(titleT * 0.037) * 50 - 30 : 0;
    dr.x += (tx - dr.x) * Math.min(1, dt * (onTitle ? 1 : 3));
    dr.y += (ty - dr.y) * Math.min(1, dt * (onTitle ? 1 : 3));
    // menus pause the action (the map does not)
    const paused = onTitle || hud.open.tree || hud.open.char || hud.open.settings || hud.open.cards || hud.open.look || hud.open.juke || hud.open.debug || dialogue.isOpen;
    // one failing system must not freeze the whole game: report it once, keep running
    requestAnimationFrame(loop);
    for (const step of [() => paused || game.update(dt), () => renderer.render(dt), () => post.render(dt), () => hud.update(dt), () => dialogue.update(dt), () => music.update(), () => ambience.update(game), () => jukebox.update(), () => duelHud && duelHud.update(dt)]) {
      try {
        step();
      } catch (err) {
        if (!reported.has(err.message)) {
          reported.add(err.message);
          console.error(err);
        }
      }
    }
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
