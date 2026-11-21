// Harbor Heat — Solmar Bay. One home for every tuning number and colour.
// The city grid lives here too (see world.js); nothing below depends on the screen.

/** Fixed simulation step, seconds: 60 updates per second at any display rate. */
export const STEP = 1 / 60;

/** Keyboard codes the game listens for (input.js maps them to actions). */
export const KEYS = {
  W: 'KeyW',
  A: 'KeyA',
  S: 'KeyS',
  D: 'KeyD',
  SPACE: 'Space',
  ENTER: 'Enter',
  E: 'KeyE',
  F: 'KeyF',
  P: 'KeyP',
  ESCAPE: 'Escape',
  SHIFT: 'ShiftLeft',
};

/** Palette shared by the interface and the procedural city (render.js reuses it). */
export const COLORS = {
  sky: '#8ec9e8',
  sea: '#1e7fa8',
  sand: '#e8d5a3',
  ground: '#5a5f66',
  road: '#2e3238',
  sidewalk: '#8a8f96',
  building: ['#e8b04b', '#d96a4a', '#7fb3d5', '#e8e0d0', '#c98bb0', '#7fc8a9', '#f0e68c', '#a89cc8'],
  player: '#ffcf3f',
  police: '#2b4acb',
  hudBg: 'rgba(12, 18, 28, 0.72)',
  hudText: '#f2f5f7',
  hudAccent: '#ffcf3f',
  danger: '#ff5a4e',
};

/** City geometry. Other modules import these numbers from here or from world.js. */
export const CITY = {
  BLOCK: 60,
  ROAD_W: 12,
  PITCH: 72,
  BOUND: 264,
  SEA_Z: 276,
};

/** Top wanted level (0 = clean, 5 = maximum heat). */
export const WANTED_MAX = 5;

/** On-foot speed, metres per second (Shift sprints at 1.6x). */
export const PLAYER_SPEED = 6;

/** Top car speed, metres per second (about 137 km/h). */
export const CAR_TOP_SPEED = 38;

/** Local-storage keys for the save and the best stats (this browser only). */
export const SAVE_KEY = 'harbor-heat-save-v1';
export const BEST_KEY = 'harbor-heat-best-v1';
