// 광선검 결투 시험장 (arena.html): 장식 없는 바닥과 단순한 경계 위에서 아나킨 대 오비완. 맵 에셋 없이 실행된다.
// 새 결투 시스템(src/combat)만 쓴다 — 게임 본편의 Game·Renderer·옛 결투 규칙과 무관하다 (docs/COMBAT.md).
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/share-tech-mono/400.css';
import './arena.css';
import { CombatSim } from './sim.js';
import { ArenaGround } from './world.js';
import { AIController } from './ai.js';
import { PlayerController } from './controls.js';
import { CombatView } from './view.js';
import { CombatHUD } from './hud.js';
import { Audio } from '../core/audio.js';

const q = new URLSearchParams(location.search);
const state = {
  playerSide: q.get('side') === 'obiwan' ? 1 : 0,
  watching: q.has('watch'), // AI 대 AI
  paused: false,
  speed: 1,
  debug: q.has('debug'),
  started: q.has('autostart'),
  seed: Number(q.get('seed')) || 1,
};

const player = new PlayerController(window);
const ais = [new AIController('anakin', state.seed), new AIController('obiwan', state.seed + 100)];
// 시작 위치: 화면 왼쪽 아나킨, 오른쪽 오비완 (4.2 m)
const sim = new CombatSim({ ground: new ArenaGround(0, 0, 7), spawns: [{ x: -1.5, y: 1.5 }, { x: 1.5, y: -1.5 }], cast: ['anakin', 'obiwan'] });
const assign = () => {
  sim.controllers = [0, 1].map((i) => (!state.watching && i === state.playerSide ? player : ais[i]));
};
assign();
sim.reset();

const view = new CombatView(document.getElementById('cb-canvas'), sim);
view.debug = state.debug;
const hud = new CombatHUD(document.getElementById('cb-hud'), sim, {
  playerSide: () => state.playerSide,
  watching: () => state.watching,
  paused: () => state.paused,
  speed: () => state.speed,
  ais: () => sim.controllers.map((c) => (c instanceof AIController ? c : null)),
});
const syncAIs = () => (view.ais = sim.controllers.map((c) => (c instanceof AIController ? c : null)));
syncAIs();

// --- 소리: 기존 오디오 장치(core/audio.js)를 재생에만 쓴다 -----------------------------------------------------
const audio = new Audio();
audio.listener = sim.fighters[state.playerSide];
const at = (p) => (p ? { x: p[0], y: p[1] } : null);
sim.on((e) => {
  if (!audio.ctx) return;
  switch (e.type) {
    case 'active':
      audio.play('swing', e.by, { heavy: e.kind === 'heavy', rate: e.kind === 'heavy' ? 0.85 : 1.15 });
      break;
    case 'block':
      audio.play('clash', at(e.at), { heavy: e.kind === 'heavy' || e.broke });
      break;
    case 'parry':
      audio.play('clash', at(e.at), { perfect: true });
      break;
    case 'clash':
      audio.play('clash', at(e.at), { heavy: true });
      break;
    case 'hit':
      audio.play('hit', at(e.at), { crit: e.punish || e.kind === 'heavy' });
      break;
    case 'break':
      audio.play('slam', e.target);
      break;
    case 'reset':
      audio.play('ignite');
      break;
  }
});

const start = () => {
  if (state.started && document.getElementById('cb-start').classList.contains('off')) return;
  state.started = true;
  document.getElementById('cb-start').classList.add('off');
  audio.unlock();
  setTimeout(() => {
    audio.setHum(0.55);
    audio.play('ignite');
  }, 50);
};
document.getElementById('cb-go').addEventListener('click', (e) => (e.stopPropagation(), start()));
if (state.started) document.getElementById('cb-start').classList.add('off');
addEventListener('pointerdown', () => audio.unlock(), { capture: true });

const restart = () => {
  sim.reset();
  player.reset();
};

addEventListener('keydown', (e) => {
  if (!state.started) {
    if (e.code === 'Enter' || e.code === 'Space') start();
    return;
  }
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyR':
      restart();
      break;
    case 'F3':
    case 'Backquote':
      e.preventDefault();
      view.debug = state.debug = !state.debug;
      break;
    case 'KeyP':
      state.paused = !state.paused;
      break;
    case 'KeyN':
      if (state.paused) sim.step();
      break;
    case 'KeyM':
      state.watching = !state.watching;
      assign();
      syncAIs();
      restart();
      break;
    case 'KeyC':
      state.playerSide = 1 - state.playerSide;
      audio.listener = sim.fighters[state.playerSide];
      assign();
      syncAIs();
      restart();
      break;
    case 'KeyH':
      hud.toggleGuide();
      break;
    case 'Digit1':
      state.speed = 1;
      break;
    case 'Digit2':
      state.speed = 0.5;
      break;
    case 'Digit3':
      state.speed = 0.25;
      break;
  }
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  player.enabled = state.started && !state.watching;
  if (state.started && !state.paused) sim.advance(dt * state.speed);
  view.render(dt * (state.paused ? 0 : state.speed));
  hud.update(dt, state.debug);
}
requestAnimationFrame(frame);

// QA (tools/qa/arena.mjs)
window.__combat = { sim, view, hud, state, player, ais, restart };
