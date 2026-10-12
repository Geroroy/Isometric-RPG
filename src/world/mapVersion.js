// Which Coruscant to build: the original layout, or the rebuilt one (docs/CORUSCANT_REBUILD.md —
// the 1:1 building sheets, src/data/undercity_v2.json) with ?map=v2, or in a build made with
// VITE_MAP_V2=1 (a test build for review). Off by default until it is approved.
export const MAP_V2 = import.meta.env.VITE_MAP_V2 === '1' || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('map') === 'v2');
