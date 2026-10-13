// The ground's kinds (worldgen.js builds the maps of them; gfx/terrain.js paints them). Its own module so the
// terrain worker (gfx/terrainWorker.js) can import it without the world generator and its models.
export const BIOME = {
  DUST: 0,
  ROCK: 1,
  CRYSTAL: 2,
  SCORCH: 3,
  RUIN: 4,
  BASE: 5,
  GRASS: 6,
  HANGAR: 7,
  MUSTAFAR: 8, // the mining facility's metal decks
  LAVA: 9,
  ASH: 10, // black volcanic sand
  CITY_UP: 11, // the city hub's upper level: polished stone
  CITY_LOW: 12, // the lower level: grimy duracrete
  VOID: 13, // the drop between the levels / off the platforms
  CITY_MOSAIC: 14, // the undercity plaza's pavement: cracked mosaic with neon veins
  CITY_MUD: 15, // the undercity's wet alleys: mud over conduits, puddles (slow)
  CITY_SWAMP: 16, // the undercity's sump: standing water and moss (slow)
  CITY_DIRT: 17, // the undercity's packed dirt (the residential court)
  GRATE: 18, // Mustafar catwalk grating
};
