// 결투 시험장의 화면 정보 (DOM): 체력·균형, 주도권, 방금 일어난 일과 그 이유, 버려진 입력, 조작 안내, 승패,
// 디버그 패널(F3: 상태·자원·AI 의도·최근 판정). 시뮬레이션은 읽기만 한다.
import { TUNING as T } from './tuning.js';
import { describe } from './view.js';

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
};

const KIND = { light1: '베기', light2: '베기 2', light3: '마무리 베기', heavy: '강공격' };
const WHY_HIT = {
  open: '방어하지 않음',
  combo: '경직 중 이어 맞음',
  counter: '공격 준비 중에 끊김',
  busy: '공격 회복 중 (빈틈)',
  dodge: '회피가 늦음',
  parried: '쳐내진 뒤 방어를 안 올림',
  staggered: '튕긴 뒤 방어를 안 올림',
  flank: '옆·뒤에서 맞음 (방어 각도 밖)',
  broken: '균형 붕괴 응징',
};
const WHY_WHIFF = { range: '사거리 밖', angle: '옆으로 빠져 각도 밖', evade: '회피 무적', none: '빗나감' };

export class CombatHUD {
  constructor(root, sim, opts) {
    this.sim = sim;
    this.opts = opts; // { playerSide: () => 0 | 1, ais: [], onRestart }
    this.root = root;
    root.innerHTML = '';
    this.bars = [this.makeBars('left'), this.makeBars('right')];
    root.append(...this.bars.map((b) => b.el));
    this.lead = el('div', 'cb-lead');
    this.banner = el('div', 'cb-banner');
    this.reject = el('div', 'cb-reject');
    this.badge = el('div', 'cb-badge', '임시 표현 — 전투 시험장 · 최종 그래픽 아님');
    this.mode = el('div', 'cb-mode');
    this.guide = el(
      'div',
      'cb-guide',
      `<b>WASD</b> 이동 <b>좌클릭</b> 베기(연속 3타) <b>F</b> 강공격 <b>우클릭 유지</b> 방어 <b>공격 직전 우클릭</b> 쳐내기
       <b>Space+방향</b> 회피 <b>R</b> 재시작 <b>F3</b> 디버그 <b>P</b> 일시정지 <b>M</b> AI 대 AI <b>C</b> 캐릭터 바꾸기 <b>H</b> 안내`,
    );
    this.over = el('div', 'cb-over');
    this.dbg = el('div', 'cb-debug');
    root.append(this.badge, this.mode, this.lead, this.banner, this.reject, this.guide, this.over, this.dbg);
    this.bannerT = 0;
    this.rejectSeen = [null, null];
    sim.on((e) => this.onEvent(e));
  }

  makeBars(side) {
    const e = el('div', `cb-bars ${side}`);
    e.innerHTML = `<div class="cb-name"></div>
      <div class="cb-bar hp"><i></i><span></span></div>
      <div class="cb-bar bal"><i></i><span></span></div>
      <div class="cb-state"></div>`;
    return { el: e, name: e.querySelector('.cb-name'), hp: e.querySelector('.hp i'), hpT: e.querySelector('.hp span'), bal: e.querySelector('.bal i'), balT: e.querySelector('.bal span'), balBar: e.querySelector('.bal'), state: e.querySelector('.cb-state') };
  }

  /** 방금 일어난 일을 한 줄로: 무엇이, 왜, 그래서 누가 유리한가 */
  onEvent(e) {
    const n = (f) => f && f.name;
    let text = null;
    let cls = '';
    switch (e.type) {
      case 'reset':
        this.bannerT = 0;
        this.banner.className = 'cb-banner';
        this.over.className = 'cb-over';
        return;
      case 'block':
        if (e.broke) {
          text = `${n(e.by)}의 방어가 무너짐 — ${KIND[e.kind]}에 균형 0`;
          cls = 'brk';
        } else {
          text = `${n(e.by)} 막음 · 균형 −${Math.round(e.bal)}${e.shaken ? ' (쳐내진 직후라 더 크게)' : ''} · 밀림 ${e.stun.toFixed(2)}s`;
          cls = 'blk';
        }
        break;
      case 'parry':
        text = e.broke ? `${n(e.by)} 쳐냄! ${n(e.target)} 균형 붕괴` : `${n(e.by)} 쳐냄! ${n(e.target)} 경직 ${e.stun.toFixed(2)}s (방어는 ${e.guardAfter.toFixed(2)}s 뒤) → ${n(e.by)}의 반격 기회`;
        cls = 'par';
        break;
      case 'clash':
        text = e.winner ? `${n(e.winner)}의 강공격이 기본 베기를 누름` : '두 검이 맞부딪힘 — 둘 다 튕김';
        cls = 'cls';
        break;
      case 'whiff':
        text = `${n(e.by)} 헛침 (${WHY_WHIFF[e.why]}) · 회복 +${e.extra.toFixed(2)}s → 빈틈`;
        cls = 'wif';
        break;
      case 'break':
        text = `${n(e.target)} 균형 붕괴! ${e.dur.toFixed(2)}s 동안 방어 불가 — 다가가서 베어라`;
        cls = 'brk';
        break;
      case 'hit':
        text = e.ko ? `${n(e.by)}의 ${KIND[e.kind]} — ${n(e.target)} 쓰러짐` : `${n(e.target)} 피격 −${Math.round(e.dmg)} (${WHY_HIT[e.why] || e.why})`;
        cls = 'hit';
        break;
      case 'over': {
        const me = this.sim.fighters[this.opts.playerSide()];
        const won = e.winner === me;
        const watch = this.opts.watching();
        this.over.innerHTML = `<div class="t">${watch ? `${n(e.winner)} 승리` : won ? '승리' : '패배'}</div><div class="s">${n(e.loser)} 쓰러짐 · ${this.sim.time.toFixed(1)}초 · <b>R</b> 재시작</div>`;
        this.over.className = 'cb-over on ' + (watch ? '' : won ? 'won' : 'lost');
        return;
      }
      default:
        return;
    }
    this.banner.textContent = text;
    this.banner.className = `cb-banner on ${cls}`;
    this.bannerT = 1.8;
  }

  update(dt, debug) {
    const sim = this.sim;
    const now = sim.time;
    const ps = this.opts.playerSide();
    const watch = this.opts.watching();
    // 왼쪽 = 플레이어 (관전 중엔 순서대로)
    const order = ps === 0 ? [0, 1] : [1, 0];
    order.forEach((i, j) => {
      const f = sim.fighters[i];
      const b = this.bars[j];
      b.name.textContent = `${f.cast.full}${watch ? ' · AI' : i === ps ? ' · 플레이어' : ' · AI'}`;
      b.hp.style.width = f.hp + '%';
      b.hpT.textContent = `체력 ${Math.ceil(f.hp)}`;
      b.bal.style.width = f.bal + '%';
      const regen = (f.state === 'ready' || f.state === 'guard') && now - f.balLossT >= T.balance.regenDelay && f.bal < 100;
      b.balT.textContent = `균형 ${Math.ceil(f.bal)}${f.state === 'broken' ? ' · 붕괴' : regen ? ' · 회복 중' : ''}`;
      b.balBar.classList.toggle('low', f.bal < 30);
      b.balBar.classList.toggle('broken', f.state === 'broken');
      b.state.textContent = describe(f, now);
    });
    // 주도권
    const ini = sim.initiative();
    if (ini.leader) {
      this.lead.innerHTML = `주도권 <b>${ini.leader.name}</b> +${Math.min(1, ini.adv).toFixed(2)}s`;
      this.lead.className = `cb-lead on ${ini.leader.side === ps && !watch ? 'me' : 'foe'}`;
    } else {
      this.lead.innerHTML = ini.dist > 3.4 ? '거리 벌어짐' : '대등';
      this.lead.className = 'cb-lead';
    }
    this.bannerT -= dt;
    if (this.bannerT <= 0 && this.banner.classList.contains('on')) this.banner.className = 'cb-banner';
    // 버려진 입력 (플레이어)
    const me = sim.fighters[ps];
    const rj = me.reject;
    if (!watch && rj && rj !== this.rejectSeen[ps]) {
      this.rejectSeen[ps] = rj;
      const what = { light: '베기', heavy: '강공격', dodge: '회피' }[rj.type];
      this.reject.textContent = `입력 무시: ${what} — ${rj.reason}`;
      this.reject.className = 'cb-reject on';
      this.rejectT = 1.2;
    }
    this.rejectT = (this.rejectT || 0) - dt;
    if (this.rejectT <= 0) this.reject.className = 'cb-reject';
    this.mode.textContent = watch ? '관전: AI 대 AI (M으로 돌아가기)' : this.opts.paused() ? '일시정지 (P 계속 · N 한 틱)' : this.opts.speed() !== 1 ? `속도 ×${this.opts.speed()}` : '';
    this.mode.className = 'cb-mode' + (this.mode.textContent ? ' on' : '');
    // 디버그 패널
    this.dbg.classList.toggle('on', debug);
    if (debug) this.drawDebug(now);
  }

  drawDebug(now) {
    const sim = this.sim;
    const ais = this.opts.ais();
    const rows = sim.fighters.map((f) => {
      const ai = ais[f.side];
      const seen = ai && ai.seen;
      const b = f.buffer;
      return `<div class="f"><b>${f.name}</b> ${describe(f, now)}<br>
        체력 ${f.hp.toFixed(1)} · 균형 ${f.bal.toFixed(1)} · 행동 가능까지 ${Math.min(9, f.actionableIn(now)).toFixed(2)}s
        ${f.parryActive(now) ? `<br><span class="par">쳐내기 창 ${(f.parryUntil - now).toFixed(3)}s</span>` : ''}
        ${b ? `<br>버퍼: ${b.type} ${(now - b.t).toFixed(2)}s 전${b.reason ? ' · ' + b.reason : ''}` : ''}
        ${f.reject ? `<br><span class="dim">버려짐: ${f.reject.type} · ${f.reject.reason}</span>` : ''}
        ${ai ? `<br>AI 의도: <b>${ai.intentLabel}</b> · 관측 지연 ${ai.delay.toFixed(2)}s<br>인지한 상대: ${seen ? `${seen.state}${seen.atkKind ? ' ' + seen.atkKind + '/' + seen.atkPhase : ''} (${(now - seen.t).toFixed(2)}s 전 모습)` : '-'}` : '<br>플레이어 조작'}</div>`;
    });
    const log = sim.log
      .slice(-10)
      .reverse()
      .map((e) => `<li class="${e.type}">${e.t.toFixed(2)} ${e.type} ${e.by ? e.by.name : ''}${e.target ? '→' + e.target.name : ''} ${e.kind ? KIND[e.kind] : ''} ${e.why ? '· ' + (WHY_HIT[e.why] || WHY_WHIFF[e.why] || e.why) : ''}${e.dmg ? ' −' + e.dmg.toFixed(0) : ''}${e.bal ? ' 균형−' + e.bal.toFixed(0) : ''}</li>`)
      .join('');
    const st = sim.stats;
    this.dbg.innerHTML = `${rows.join('')}<div class="f">시간 ${now.toFixed(2)}s · 틱 ${sim.tick} · 주도권 교대 ${st.leadChanges}<br>막기 ${st.block} · 쳐내기 ${st.parry} · 맞부딪힘 ${st.clash} · 헛침 ${st.whiff} · 붕괴 ${st.break} · 피격 ${st.hit}</div><ol>${log}</ol>`;
  }

  toggleGuide() {
    this.guide.classList.toggle('off');
  }
}
