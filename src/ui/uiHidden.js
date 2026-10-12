// A clean view: every bit of UI off (the HUD, the overlay canvas's health bars and floating text, the cutscene's
// subtitles and bars, the selection ring: style.css body.ui-hidden, renderer.drawGroundMarkers). F1 on a PC
// (core/input.js); on a phone the menu's "숨김" key (ui/mobileHud.js), and while hidden a faint restore button stays
// in the top-right corner (a phone has no key to bring the UI back).

let restore = null;

export function setUIHidden(game, on) {
  game.uiHidden = on;
  document.body.classList.toggle('ui-hidden', on);
  if (!restore) {
    restore = document.createElement('button');
    restore.id = 'uiRestore';
    restore.type = 'button';
    restore.textContent = 'UI';
    restore.title = 'UI 다시 보이기 (F1)';
    restore.setAttribute('aria-label', 'UI 다시 보이기');
    restore.addEventListener('pointerdown', (e) => e.stopPropagation());
    restore.addEventListener('click', (e) => {
      e.stopPropagation();
      setUIHidden(game, false);
    });
    document.body.appendChild(restore);
  }
}

export const toggleUI = (game) => setUIHidden(game, !game.uiHidden);
