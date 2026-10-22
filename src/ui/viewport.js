// The view box: the part of the screen the game draws in, after the device's aspect ratio.
//
//   ASPECT.min … ASPECT.max (4:3 … 12:5)  Hor+: the same rows at zoom 1 (renderer.baseH), the width shows
//                                         as much more or less of the world as the screen is wide —
//                                         a tablet sees a little less to the sides, a phone or a 21:9
//                                         monitor more
//   narrower than ASPECT.min              Vert+: a foldable's inner screen, an iPad in split view, a narrow
//                                         window keep at least a 4:3 width of world; the extra height
//                                         shows more above and below (renderer.baseH; down to 3:4)
//   wider than ASPECT.max                 pillarboxed: a 32:9 monitor draws a 12:5 box in the middle with
//                                         dark bars at the sides, so the view and the HUD don't stretch
//                                         across the whole desk (the zoom-out limits still apply inside)
//
// The box is the document body itself (body.boxed: narrowed, centred, and made the containing block of
// every fixed element by a transform), so the canvases, the HUD, menus and overlays all sit in it with no
// changes of their own. Pointer events still report viewport coordinates: toViewX turns them into the
// box's. CSS gets --view-x, --view-w and --vw (1% of the box's width, in place of the viewport's vw).
export const ASPECT = { min: 4 / 3, max: 12 / 5 };

export const view = { x: 0, w: 0, h: 0, aspect: 1, boxed: false };

/** Measure the box for the window's current size (cheap; called on every resize). */
export function measureView() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const w = Math.min(W, Math.round(H * ASPECT.max));
  view.x = Math.floor((W - w) / 2);
  view.w = w;
  view.h = H;
  view.aspect = w / Math.max(1, H);
  view.boxed = w < W;
  const s = document.documentElement.style;
  s.setProperty('--view-x', view.x + 'px');
  s.setProperty('--view-w', w + 'px');
  s.setProperty('--vw', w / 100 + 'px');
  if (document.body) document.body.classList.toggle('boxed', view.boxed);
  return view;
}

/** A pointer's viewport x (clientX) → x in the view box. */
export const toViewX = (cx) => cx - view.x;

/**
 * How many times taller than its zoom-1 rows the view must be so it still shows a 4:3 width of the
 * world (1 at 4:3 and wider). Only down to a 3:4 screen: past that (a phone held upright — the touch
 * UI asks to turn it — or a tall PC window) the view just narrows, the rows stay.
 */
export const vertPlus = () => Math.max(1, ASPECT.min / Math.max(3 / 4, view.aspect));

measureView();
window.addEventListener('resize', measureView);
if (!document.body) document.addEventListener('DOMContentLoaded', measureView, { once: true });
