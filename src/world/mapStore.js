// The map editor's save kept in the browser (localStorage), so an edited map plays again on the next load without
// touching the map file (public/maps/mustafar.json) — in a build (the artifact) and under `npm run dev` alike.
// The copy remembers which file it was edited from (a hash of the file's text): a newer file (the edits merged into
// the repository, a later build) wins over it, so a stale copy never shadows a changed map.
const KEY = 'mustafarMap';

let base = ''; // the hash of the map file this session loaded

/** A short hash of a text (djb2), enough to tell one file from another. */
export function textHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + s.length;
}

/** The map to play: the browser's saved copy when it was edited from this very file, else the file's. */
export function pickMap(fileText) {
  base = textHash(fileText);
  const file = JSON.parse(fileText);
  const local = loadLocal();
  if (!local) return { map: file, local: false };
  if (local.base !== base) {
    console.warn('맵 에디터의 브라우저 저장본이 지금 맵 파일보다 오래되어 파일을 씁니다 (에디터의 "파일로 되돌리기"로 지울 수 있음)');
    return { map: file, local: false, stale: true };
  }
  try {
    return { map: JSON.parse(local.text), local: true };
  } catch {
    return { map: file, local: false };
  }
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

/** Keep the edited map (its file text) for the next load. False when the browser refused (private mode, quota). */
export function saveLocal(text) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ base, text, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function hasLocal() {
  return !!loadLocal();
}

/** Drop the browser's copy: the next load plays the file again. */
export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}
