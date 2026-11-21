// The game's state: one plain object, no three.js, no DOM. Every system reads
// and writes this shape (see INTERFACES.md). Ground positions are plain {x, z}
// and heading is radians, forward vector (sin(heading), cos(heading)) in (x, z).
// Heading 0 faces +Z (south, toward the sea).
import { createRandom } from './random.js';

export function createGameState(seed) {
  return {
    seed,
    rng: createRandom(seed),
    time: 0,
    screen: 'title',
    player: {
      x: -36,
      z: 180,
      heading: 0,
      speed: 0,
      health: 100,
      cash: 0,
      wanted: 0,
      onFoot: true,
      carId: null,
      hasPackage: false,
      pistol: true,
      ammo: Infinity,
    },
    cars: [],
    peds: [],
    mission: {
      index: -1,
      step: 0,
      title: '',
      text: '',
      target: { x: 0, z: 288 },
      radius: 8,
      timer: 0,
      timeLeft: 0,
      state: 'idle',
      reward: 0,
    },
    stats: { missionsDone: 0, carsStolen: 0, distance: 0, shotsFired: 0 },
    events: [],
  };
}

/** Restore a state to its fresh, just-created values, in place. The seed is
// kept, so the world the state belongs to stays the same after a reset. */
export function resetState(state) {
  state.rng = createRandom(state.seed);
  state.time = 0;
  state.screen = 'title';
  const p = state.player;
  p.x = -36;
  p.z = 180;
  p.heading = 0;
  p.speed = 0;
  p.health = 100;
  p.cash = 0;
  p.wanted = 0;
  p.onFoot = true;
  p.carId = null;
  p.hasPackage = false;
  p.pistol = true;
  p.ammo = Infinity;
  state.cars.length = 0;
  state.peds.length = 0;
  const m = state.mission;
  m.index = -1;
  m.step = 0;
  m.title = '';
  m.text = '';
  m.target = { x: 0, z: 288 };
  m.radius = 8;
  m.timer = 0;
  m.timeLeft = 0;
  m.state = 'idle';
  m.reward = 0;
  state.stats.missionsDone = 0;
  state.stats.carsStolen = 0;
  state.stats.distance = 0;
  state.stats.shotsFired = 0;
  state.events.length = 0;
}
