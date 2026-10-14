// A plain notice on screen while a zone shows placeholders in place of art not delivered yet (CLAUDE.md: a placeholder
// is never passed off as the final graphics): which manifest assets it waits for.
export function placeholderBadge(missing) {
  if (!missing || !missing.length) return null;
  const el = document.createElement('div');
  el.className = 'placeholder-badge';
  el.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;padding:4px 10px;' +
    'font:12px/1.4 "Share Tech Mono",monospace;color:#ffd0f4;background:rgba(40,0,36,.72);border:1px solid #e040c8;border-radius:3px;text-align:center';
  el.textContent = `임시 플레이스홀더 — 최종 그래픽 아님 · 에셋 대기: ${missing.map((m) => m.id).join(', ')}`;
  el.title = missing.map((m) => `${m.id}: ${m.why}`).join('\n');
  document.body.appendChild(el);
  return el;
}
