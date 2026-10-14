// A plain notice on screen while a zone shows placeholders in place of art not delivered yet (CLAUDE.md: a placeholder
// is never passed off as the final graphics): which manifest assets it waits for, and which stages are still in blockout
// (grey boxes: docs/MUSTAFAR_REBUILD.md "블록아웃").
export function placeholderBadge(missing, blockout) {
  missing = missing || [];
  blockout = blockout || [];
  if (!missing.length && !blockout.length) return null;
  const el = document.createElement('div');
  el.className = 'placeholder-badge';
  el.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;padding:4px 10px;' +
    'font:12px/1.4 "Share Tech Mono",monospace;color:#ffd0f4;background:rgba(40,0,36,.72);border:1px solid #e040c8;border-radius:3px;text-align:center';
  const parts = [];
  if (blockout.length) parts.push(`블록아웃(회색 상자): STAGE ${blockout.map((n) => String(n).padStart(2, '0')).join('·')}`);
  if (missing.length) parts.push(`에셋 대기: ${missing.map((m) => m.id).join(', ')}`);
  el.textContent = `임시 플레이스홀더 — 최종 그래픽 아님 · ${parts.join(' · ')}`;
  el.title = [...missing.map((m) => `${m.id}: ${m.why}`), ...(blockout.length ? ['블록아웃: 동선·충돌·전투 공간 시험용 회색 상자 (최종 그래픽 아님)'] : [])].join('\n');
  document.body.appendChild(el);
  return el;
}
