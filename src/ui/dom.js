// Writes that touch the DOM only when the value really changes. Rewriting the same text or
// class every frame still makes the browser re-lay-out and repaint that part of the HUD
// (on phones the whole full-screen touch layer), which kept the GPU busy for nothing.
export function setText(e, v) {
  v = String(v);
  if (e.textContent !== v) e.textContent = v;
}
export function setHTML(e, v) {
  if (e._html !== v) e.innerHTML = e._html = v;
}
export function setClass(e, v) {
  if (e.className !== v) e.className = v;
}
