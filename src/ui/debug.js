// Debug panel (` key, or Settings → 디버그 모드): unlocks and test helpers.
// Everything acts on the running game immediately; switches stay on until
// they are turned off or the page is reloaded.
import { SKILLS, isActive } from '../game/skills.js';
import { CARDS } from '../game/perks.js';
import { BASE_POS, FACTORY_POS, CITY } from '../world/worldgen.js';
import { dist } from '../core/math.js';

export class DebugUI {
  constructor(hud, game, music, audio) {
    this.hud = hud;
    this.game = game;
    this.music = music;
    this.audio = audio;
    this.el = hud.overlay('debugpanel', '디버그 모드', '<div class="ov-sub">테스트용 · 진행 상황에 바로 적용됩니다</div>');
    this.body = this.el.querySelector('.ov-body');
    this.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const msg = this.act(b.dataset.act);
      this.audio.play('click');
      if (msg) this.hud.log(`[디버그] ${msg}`, 'sys');
      this.render();
    });
  }

  render() {
    const c = this.game.cheats;
    const sw = (key, label) => `<button type="button" class="dbg-sw${c[key] ? ' on' : ''}" data-act="sw:${key}"><i></i>${label}<b>${c[key] ? 'ON' : 'OFF'}</b></button>`;
    const btn = (act, label) => `<button type="button" data-act="${act}">${label}</button>`;
    const heard = this.music.catalog.filter((t) => this.music.heard.has(t.url)).length;
    this.body.innerHTML = `
      <section class="dbg-card"><h4>해금</h4>
        ${btn('skills', '모든 스킬 최대 레벨')}
        ${btn('music', `모든 음악 해금 <small>${heard} / ${this.music.catalog.length || '-'}</small>`)}
        ${btn('cards', '모든 스타 카드 최고 등급')}
        ${btn('relock', '음악 해금 초기화')}
      </section>
      <section class="dbg-card"><h4>성장 · 자원</h4>
        ${btn('lv5', '레벨 +5')}
        ${btn('sp', '스킬 포인트 +10')}
        ${btn('ap', '능력치 포인트 +10')}
        ${btn('credits', '크레딧 +1000')}
        ${btn('parts', '크래프팅 부품 +500')}
        ${btn('heal', '생명력 · 포스 · 박타 가득')}
      </section>
      <section class="dbg-card"><h4>전투</h4>
        ${sw('god', '무적')}
        ${sw('force', '포스 무한')}
        ${sw('cd', '재사용 대기시간 없음')}
        ${btn('kill', '주변 적 모두 처치')}
        ${btn('light', '어둠 게이지 0')}
      </section>
      <section class="dbg-card"><h4>월드</h4>
        ${btn('reveal', '지도 전체 공개')}
        ${btn('tp:hub', '코러산트 착륙장으로 이동')}
        ${btn('tp:cantina', '언더시티 바로 이동')}
        ${btn('tp:base', '크리스토프시스 기지로 이동')}
        ${btn('tp:camp', '가장 가까운 거점으로 이동')}
        ${btn('tp:factory', '드로이드 공장으로 이동')}
      </section>`;
  }

  /** Runs one action; returns the line for the console log. */
  act(a) {
    const g = this.game;
    const p = g.player;
    if (a.startsWith('sw:')) {
      const k = a.slice(3);
      g.cheats[k] = !g.cheats[k];
      return null;
    }
    if (a.startsWith('tp:')) return this.teleport(a.slice(3));
    switch (a) {
      case 'skills':
        for (const [id, s] of Object.entries(SKILLS)) {
          p.skills[id] = s.max;
          if (isActive(id) && !p.hotbar.includes(id)) {
            const free = p.hotbar.indexOf(null);
            if (free >= 0) p.hotbar[free] = id;
          }
        }
        p.recalc();
        return '모든 스킬을 최대 레벨로 올렸습니다';
      case 'music': {
        const m = this.music;
        if (!m.catalog.length) return '음악을 아직 불러오지 않았습니다 (화면을 한 번 누른 뒤 다시)';
        for (const t of m.catalog) m.heard.add(t.url);
        m.save();
        return `음악 ${m.catalog.length}곡을 모두 해금했습니다 (칸티나 주크박스)`;
      }
      case 'relock':
        this.music.heard.clear();
        this.music.save();
        return '음악 해금을 초기화했습니다';
      case 'cards': {
        const c = p.cards;
        for (const id of Object.keys(CARDS)) c.owned[id] = 3;
        p.recalc();
        return '모든 스타 카드를 최고 등급으로 해금했습니다';
      }
      case 'lv5':
        g.devLevels(5);
        return `레벨 ${p.level}`;
      case 'sp':
        p.skillPoints += 10;
        return '스킬 포인트 +10';
      case 'ap':
        p.attrPoints += 10;
        return '능력치 포인트 +10';
      case 'credits':
        p.credits += 1000;
        return '크레딧 +1000';
      case 'parts':
        p.cards.parts += 500;
        return '크래프팅 부품 +500';
      case 'heal':
        p.hp = p.maxHp;
        p.force = p.maxForce;
        p.bacta = 5;
        return '생명력 · 포스 · 박타를 채웠습니다';
      case 'light':
        p.darkness = 0;
        return '어둠 게이지를 비웠습니다';
      case 'kill': {
        let n = 0;
        for (const u of g.units) {
          if (u.team === 'cis' && !u.dead && dist(u.x, u.y, p.x, p.y) < 18) {
            g.kill(u);
            n++;
          }
        }
        return `주변 적 ${n}기 처치`;
      }
      case 'reveal':
        g.world.explored.fill(1);
        if (this.hud.updateFog) this.hud.updateFog();
        return '지도를 모두 공개했습니다';
    }
    return null;
  }

  teleport(where) {
    const g = this.game;
    const p = g.player;
    // the city hub or the Christophsis front
    const place = where === 'hub' || where === 'cantina' ? 'hub' : 'christophsis';
    if (g.places && g.place !== place) g.travel(place, g.places[place].world.landing);
    let t;
    if (where === 'hub') t = { x: CITY.pad.x - 4, y: CITY.pad.y + 1.5 };
    else if (where === 'base') t = { x: BASE_POS.x + 0.5, y: BASE_POS.y + 1.5 };
    else if (where === 'cantina') t = { x: CITY.bar.x, y: CITY.bar.y - 0.5 };
    else if (where === 'factory') t = { x: FACTORY_POS.x + 14, y: FACTORY_POS.y + 2 };
    else {
      const camps = g.world.camps.filter((c) => !c.cleared && !c.boss).sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
      if (!camps.length) return '남은 거점이 없습니다';
      t = { x: camps[0].x + 6, y: camps[0].y + 6 };
    }
    const f = g.pathfinder.nearestFree(Math.floor(t.x), Math.floor(t.y), 6);
    p.x = f[0] + 0.5;
    p.y = f[1] + 0.5;
    p.action = null;
    p.path = null;
    return '순간 이동';
  }
}
