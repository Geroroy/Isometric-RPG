// Entry point: bake sprites, build the world, then run the game loop.
import './style.css';
import './ui/theme.css'; // the UI design system (docs/UI_SYSTEM.md): restyles what style.css lays out
import { fontsReady } from './ui/fonts.js'; // the HUD's fonts (Orbitron, Share Tech Mono, Rajdhani…), bundled
import { applySkin } from './ui/skin.js';
import { bakeAssets, bakeDuelAssets, bakeSkin, bakeCharacter, CHARACTERS } from './gfx/assets.js';
import { setRemasterAllowed } from './gfx/remaster.js';
import { loadSheets } from './gfx/sheet.js';
import { prune as pruneFiles, stats as fileStats, cachedJSON, cachedBlob } from './gfx/fileCache.js';
import { loadCitySprites } from './gfx/citySprites.js';
import { setCityFootprints } from './world/cityProps.js';
import { setMustafarMap } from './world/worldgen.js';
import { pickMap } from './world/mapStore.js';
import { setFloorTexture, setGroundTextures, setFacilityFloor, setLavaTexture } from './gfx/terrain.js';
import { loadMustafarFloor, loadMustafarTexture, loadMustafarConsoles, loadMustafarDroid, loadCargo, loadRocks, loadWalls, addMirror, MIRROR_SUFFIX } from './gfx/mustafarFloor.js';
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
import { Ambience } from './core/ambience.js';
import { JukeboxUI } from './ui/jukebox.js';
import { DebugUI } from './ui/debug.js';
import { MapEditor } from './ui/mapEditor.js';
import { TouchControls, isTouchDevice, hasMouse } from './ui/touch.js';
import { MobileHUD } from './ui/mobileHud.js';
import { Fullscreen } from './ui/fullscreen.js';
import { ZoomControl } from './ui/zoom.js';
import { PortraitPhoto } from './ui/portraitPhoto.js';
import { DialogueUI } from './ui/dialogue.js';
import { CinemaUI } from './ui/cinemaUI.js';
import { startDialogue } from './game/dialogue.js';
import { SABER } from './gfx/saberStyle.js';

applySkin();
const loading = document.getElementById('loading');
const bar = document.querySelector('#loading .bar div');
const label = document.querySelector('#loading .label');

// '#duel' / '#duel-mustafar' select a Movie Duel (a hash works on any host); switching reloads
const DUEL = location.hash === '#duel' ? 'geonosis' : location.hash === '#duel-mustafar' ? 'mustafar' : null;
const MODE = DUEL ? 'duel' : 'campaign';
setRemasterAllowed(DUEL === 'mustafar'); // the remastered graphics: the Mustafar duel only (gfx/remaster.js)
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
  await fontsReady(); // the HUD's fonts in before the first frame (canvas text keeps what it is drawn with)
  const assets = await bakeAssets(onProgress);
  let mustafarMirrors = []; // (the map's name~m sprites: made once the cargo is loaded too, below)
  // characters rendered in Blender: sprite sheet + frame JSON (after the bake
  // has been cached — the cache stores baked canvases only)
  Object.assign(assets.sprites, await loadSheets(Object.keys(CHARACTERS), onProgress));
  // the Coruscant undercity's Blender-rendered buildings and street
  if (MODE === 'campaign') {
    assets.city = await loadCitySprites(onProgress);
    setCityFootprints(assets.city);
    setFloorTexture(assets.city.floor);
    setGroundTextures(assets.city.ground);
  }
  if (MODE === 'duel') Object.assign(assets.sprites, (await bakeDuelAssets(onProgress, DUEL)).sprites);
  // Mustafar: Anakin in the campaign's own Blender outfits — the cloak with the hood up, hood down, the tunic
  if (DUEL === 'mustafar') Object.assign(assets.sprites, await loadSheets(['anakin_vader', 'anakin_robe', 'anakin_tunic'], onProgress));
  // and the facility's floor, the film's (terrain.js lays it out per room)
  if (DUEL === 'mustafar') setFacilityFloor(await loadMustafarFloor().catch((e) => console.warn('무스타파 바닥: ' + e.message)));
  if (DUEL === 'mustafar') setLavaTexture(await loadMustafarTexture('lava.png').catch((e) => console.warn('무스타파 용암: ' + e.message)));
  // and its wall consoles, placed as the city's sheet sprites are (worldgen.js addSheetProp)
  if (DUEL === 'mustafar') {
    // (with the rooms' near walls and the parts cut from the set: one atlas, tools/sprites/mustafar_set/lowwall.py + parts.py)
    assets.city = { ...(await loadMustafarConsoles()), ...(await loadRocks()), ...(await loadWalls()) };
    setCityFootprints(assets.city);
    // the river droid and Obi-Wan's platform: the film's, in place of the models baked with the duel
    const droid = await loadMustafarDroid().catch((e) => console.warn('무스타파 드로이드: ' + e.message));
    if (droid) assets.sprites.collector = droid;
    const platform = await loadMustafarDroid('mfPlatform').catch((e) => console.warn('무스타파 플랫폼: ' + e.message));
    if (platform) assets.sprites.platform = platform;
    // the map: its file (the map editor's), laid out by worldgen.js MustafarArena — or the editor's save kept in
    // this browser when it was made from this file (world/mapStore.js)
    const picked = pickMap(await (await cachedBlob(import.meta.env.BASE_URL + 'maps/mustafar.json')).text());
    const map = picked.map;
    if (picked.local) console.info('무스타파 맵: 맵 에디터의 브라우저 저장본을 씁니다');
    setMustafarMap(map);
    mustafarMirrors = map.props.filter((e) => e.sheet && e.sheet.endsWith(MIRROR_SUFFIX)).map((e) => e.sheet.slice(0, -MIRROR_SUFFIX.length));
  }
  // the cargo containers, in every mode (they stand in for the old model crates: worldgen.js CARGO_SWAP)
  assets.city = { ...(assets.city || {}), ...(await loadCargo()) };
  // the Mustafar map's sprites turned the other way that have no baked twin (name~m: the map editor's R)
  for (const n of mustafarMirrors) addMirror(assets.city, n);
  setCityFootprints(assets.city);
  // the equipped appearance (the Movie Duel keeps the default look)
  const look = MODE === 'campaign' ? savedLook() : null;
  if (look && !assets.sprites[look.sprite]) assets.sprites[look.sprite] = await bakeSkin(look.sprite, (k) => onProgress(k, '외형 준비 중…'));
  // QA: a character baked from the pose code instead of its sheet — a new animation before its render.
  // ?qaBake=anakin (all of it) or anakin:sig (only that animation, put into the sheet's set);
  // a build can carry it as VITE_QA_BAKE (a playable preview of a move).
  const qaBake = new URLSearchParams(location.search).get('qaBake') || import.meta.env.VITE_QA_BAKE;
  if (qaBake) {
    for (const item of qaBake.split(',')) {
      const [n, only] = item.split(':');
      if (only && !assets.sprites[n]) continue; // that set isn't part of this mode
      const baked = await bakeCharacter(n, (k) => onProgress(k, '새 동작 준비 중…'), only ? only.split('+') : null);
      if (only) Object.assign(assets.sprites[n].anims, baked.anims);
      else assets.sprites[n] = baked;
    }
  }
  label.textContent = MODE === 'duel' ? DUEL_TITLES[DUEL][3] : '코러산트 · 크리스토프시스 생성 중…';
  await new Promise((r) => setTimeout(r, 20));

  const audio = new Audio();
  const game = new Game(assets, audio, MODE, DUEL || undefined);
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
  const mobile = (hud.mobile = new MobileHUD(game, hud, audio)); // the phone's own chrome (shown with body.touch)
  const fullscreen = new Fullscreen();
  input.onFullscreen = mobile.onFullscreen = () => fullscreen.toggle();
  const zoom = new ZoomControl(renderer, touch);
  input.onZoom = (dir) => (dir === 0 ? zoom.reset() : zoom.step(dir));
  // the map editor (F2): the Mustafar duel's map, edited in place (ui/mapEditor.js)
  const editor = DUEL === 'mustafar' ? new MapEditor({ game, renderer, assets, onExit: () => zoom.restore() }) : null;
  touch.onEnable = () => zoom.restore();

  const measure = () => {
    // keep Anakin centred in the part of the screen above the console (the zoom limits use it too)
    renderer.consoleH = document.querySelector('.console').offsetHeight;
    document.documentElement.style.setProperty('--console-h', renderer.consoleH + 'px');
    renderer.resize();
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
    if (c && !game.duel && !document.body.classList.contains('title')) hud.log(`♪ 칸티나 주크박스에 추가: ${c.title}`, 'gold');
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
    if (started) return; // reopened with H / HELP: just resume
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
  window.__mobile = mobile; // QA (tools/qa)
  window.__dialogue = dialogue;
  window.__music = music;
  window.__editor = editor; // QA (the map editor)
  let last = performance.now();
  let titleT = 0;
  const reported = new Set();
  // At most 60 frames a second: a 120/144 Hz screen would otherwise draw (and heat) twice as
  // often. Frames are skipped by an accumulator so 144 Hz still gives an even ~60. All game
  // logic runs on `dt`, so speeds and timings are the same at any frame rate.
  const FRAME_MS = 1000 / 60;
  let acc = FRAME_MS;
  let prev = performance.now();
  let hiddenTab = false;
  // the frame's systems, made once (not a fresh array of closures every frame)
  let dt = 0;
  let paused = false;
  const steps = [() => paused || game.update(dt), () => renderer.render(dt), () => editor && editor.draw(dt), () => post.render(dt), () => hud.update(dt), () => touch.enabled && mobile.update(dt), () => dialogue.update(dt), () => music.update(), () => ambience.update(game), () => jukebox.update(), () => duelHud && duelHud.update(dt)];
  const loop = (now) => {
    if (hiddenTab) return; // restarted when the tab shows again
    requestAnimationFrame(loop);
    if (prev === null) prev = last = now; // first frame after the tab came back: no catch-up jump
    acc += now - prev;
    prev = now;
    if (acc < FRAME_MS - 1.5) return;
    acc = Math.min(acc - FRAME_MS, FRAME_MS);
    dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // the first frame can stamp before `last`
    if (SABER.slow) dt *= 0.25; // the saber card's slow motion (to look at the trails)
    last = now;
    if (!(editor && editor.holds)) input.update(dt);
    touch.update(dt);
    // the title screen sits over the live world: hide the HUD, drift the camera
    const onTitle = !help.classList.contains('hidden');
    if (onTitle !== document.body.classList.contains('title')) {
      document.body.classList.toggle('title', onTitle);
      if (!onTitle) zoom.restore(); // back to the player's own zoom
    }
    if (onTitle && renderer.zoom !== renderer.shotZoom(0.6)) renderer.setZoom(renderer.shotZoom(0.6), true); // a wider, cinematic shot
    titleT += dt;
    const dr = renderer.drift;
    const tx = onTitle ? Math.sin(titleT * 0.05) * 150 : 0;
    const ty = onTitle ? Math.sin(titleT * 0.037) * 50 - 30 : 0;
    dr.x += (tx - dr.x) * Math.min(1, dt * (onTitle ? 1 : 3));
    dr.y += (ty - dr.y) * Math.min(1, dt * (onTitle ? 1 : 3));
    // menus pause the action (the map does not)
    paused = (editor && editor.holds) || onTitle || hud.open.tree || hud.open.char || hud.open.settings || hud.open.cards || hud.open.look || hud.open.juke || hud.open.debug || dialogue.isOpen;
    // one failing system must not freeze the whole game: report it once, keep running
    for (const step of steps) {
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
  // a hidden tab: no frames, no sound (the music and ambience stop with the audio clock)
  const pausedEls = [];
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenTab = true;
      if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend();
      for (const t of music.tracks.values()) if (!t.el.paused) (t.el.pause(), pausedEls.push(t.el));
    } else if (hiddenTab) {
      hiddenTab = false;
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
      for (const el of pausedEls.splice(0)) el.play().catch(() => {});
      prev = null;
      requestAnimationFrame(loop);
    }
  });
  // the device's file cache: what this launch read from it, what it downloaded; then drop what the build no longer has
  console.info(`파일 캐시: 기기에서 ${fileStats.hit}개, 내려받음 ${fileStats.miss}개`);
  pruneFiles();
  window.__ready = true;
}

// Offline cache / installable app (only on a real web host, never in dev). The worker caches files by
// content (sw.js): a new build's worker knows which files changed. When the page is still served by an
// older build's worker, wait (briefly) for this build's to take over before loading anything, so no
// changed file comes from the old cache.
function serviceWorkerReady() {
  if (!(import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext)) return Promise.resolve();
  const sw = navigator.serviceWorker;
  const reg = sw.register('./sw.js?v=' + __BUILD__).catch(() => null);
  const ctl = sw.controller;
  if (!ctl || new URL(ctl.scriptURL).searchParams.get('v') === __BUILD__) return Promise.resolve();
  return Promise.race([reg.then((r) => r && new Promise((res) => sw.addEventListener('controllerchange', res, { once: true }))), new Promise((res) => setTimeout(res, 4000))]);
}

serviceWorkerReady()
  .then(boot)
  .catch((err) => {
    console.error(err);
    label.textContent = '오류: ' + err.message;
  });
