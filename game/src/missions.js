// Harbor Heat — the Harbor Crew story missions.
//
// You play a rookie getaway driver for the Harbor Crew. Five jobs, in order:
// a pickup on foot, a timed drive to the pier, a stolen sport car, a delivery
// under police heat, and one last big score across town.
//
// A mission is a list of steps. Each step names a place; the actual {x, z}
// target is resolved from the live city when the mission starts (see
// resolvePlace), so the same table works on any seeded city. The static
// coordinates below are the road-grid fallbacks used when no city is known.

export const PLACE_MARKET = { x: -144, z: -144 };
export const PLACE_GARAGE = { x: 144, z: 144 };
export const PLACE_SAFEHOUSE = { x: -216, z: -216 };
export const PLACE_PIER = { x: 0, z: 288 };

// Keep the old constant names around too: other modules may import them.
export const MISSION_MARKET = PLACE_MARKET;
export const MISSION_GARAGE = PLACE_GARAGE;
export const MISSION_SAFEHOUSE = PLACE_SAFEHOUSE;
export const MISSION_PIER = PLACE_PIER;

// How each named place is found on a live city object. world.js publishes
// landmarks { market, garage, safehouse } and a pier; older shapes may carry
// the same points under spawns instead.
const PLACE_LOOKUP = {
  market: { fallback: PLACE_MARKET, keys: ['market'] },
  garage: { fallback: PLACE_GARAGE, keys: ['garage'] },
  safehouse: { fallback: PLACE_SAFEHOUSE, keys: ['safehouse'] },
  pier: { fallback: PLACE_PIER, pier: true },
  sport: { fallback: { x: 108, z: -36 } },
};

// The city step targets resolve against. game.js / main.js hand the live city
// in; until then the road-grid fallbacks above are used.
let missionCity = null;

export function setMissionCity(city) {
  missionCity = city || null;
}

// Resolve a named place to an {x, z} on the given city (or the stored one).
export function placePosition(name, city) {
  const entry = PLACE_LOOKUP[name];
  if (!entry) return { x: 0, z: 0 };
  const live = city || missionCity;
  if (live) {
    if (entry.pier && live.pier) return { x: live.pier.x, z: live.pier.z };
    for (const key of entry.keys || []) {
      if (live.landmarks && live.landmarks[key]) {
        return { x: live.landmarks[key].x, z: live.landmarks[key].z };
      }
      if (live.spawns && live.spawns[key]) {
        return { x: live.spawns[key].x, z: live.spawns[key].z };
      }
    }
    // The steal step just needs a busy stretch of road where a sport car can
    // be found; point at one of the city's car spawn spots when it has them.
    if (name === 'sport' && live.spawns && Array.isArray(live.spawns.cars) && live.spawns.cars.length > 3) {
      const spot = live.spawns.cars[3];
      return { x: spot.x, z: spot.z };
    }
  }
  return { x: entry.fallback.x, z: entry.fallback.z };
}

// One step of a mission definition: the kind of thing to do, the place to do
// it, how close counts as arriving, and an optional time limit in seconds.
function makeStep(type, place, radius, timer) {
  return { type, place, target: placePosition(place), radius: radius === undefined ? 8 : radius, timer: timer || 0 };
}

export const MISSIONS = [
  {
    id: 0,
    title: 'First Pickup',
    briefing: 'Walk to the package marker at the market, pick it up, and bring it back to the crew garage.',
    reward: 150,
    steps: [
      makeStep('pickup', 'market', 8),
      makeStep('deliver', 'garage', 8),
    ],
  },
  {
    id: 1,
    title: 'Harbor Delivery',
    briefing: 'The package is at the garage. Drive it down to the pier within 90 seconds.',
    reward: 250,
    steps: [
      makeStep('pickup', 'garage', 8),
      makeStep('deliver', 'pier', 8, 90),
    ],
  },
  {
    id: 2,
    title: 'Hot Wheels',
    briefing: 'The crew needs a sport car. Take one off the street and bring it to the garage.',
    reward: 400,
    steps: [
      makeStep('steal', 'sport', 10),
      makeStep('deliver', 'garage', 8),
    ],
  },
  {
    id: 3,
    title: 'Heat Run',
    briefing: 'Deliver the package to the safehouse while the police are on you. Wanted level 2 and rising — do not stop.',
    reward: 600,
    steps: [
      makeStep('pickup', 'garage', 8),
      makeStep('deliver', 'safehouse', 8),
    ],
  },
  {
    id: 4,
    title: 'The Big Score',
    briefing: 'Final job: carry the score across town to the safehouse. 120 seconds on the clock. Make it count.',
    reward: 1000,
    steps: [
      makeStep('pickup', 'market', 8),
      makeStep('deliver', 'safehouse', 10, 120),
    ],
  },
];

// Where the player (or the car they are driving) is right now.
function actorPosition(state) {
  if (!state.player.onFoot && state.player.carId !== null && state.player.carId !== undefined) {
    const car = state.cars.find((c) => c.id === state.player.carId);
    if (car) return { x: car.x, z: car.z };
  }
  return { x: state.player.x, z: state.player.z };
}

function distanceToTarget(state, target) {
  const p = actorPosition(state);
  return Math.hypot(p.x - target.x, p.z - target.z);
}

function playerCar(state) {
  if (state.player.onFoot || state.player.carId === null || state.player.carId === undefined) return null;
  return state.cars.find((c) => c.id === state.player.carId) || null;
}

function emit(state, event) {
  if (Array.isArray(state.events)) state.events.push(event);
}

// Start mission `i` (0-based). Pass the live city to re-resolve every step
// target from it; otherwise the stored city / fallbacks are used.
// Returns true when a mission started, false for a bad index.
export function startMission(state, i, city) {
  const def = MISSIONS[i];
  if (!def) return false;
  if (city) setMissionCity(city);
  const steps = def.steps.map((s) => ({
    type: s.type,
    place: s.place,
    target: placePosition(s.place, city || missionCity),
    radius: s.radius,
    timer: s.timer,
  }));
  state.mission.index = i;
  state.mission.step = 0;
  state.mission.title = def.title;
  state.mission.text = def.briefing;
  state.mission.target = steps[0].target;
  state.mission.radius = steps[0].radius;
  state.mission.timer = steps[0].timer;
  state.mission.timeLeft = steps[0].timer;
  state.mission.state = 'active';
  state.mission.reward = def.reward;
  state.mission.steps = steps;
  state.player.hasPackage = false;
  // Heat Run opens with the police already on the driver.
  if (i === 3 && state.player.wanted < 2) {
    state.player.wanted = 2;
    emit(state, { type: 'wanted-up', wanted: 2 });
  }
  emit(state, { type: 'mission-start', index: i, title: def.title });
  return true;
}

function failMission(state, reason) {
  state.mission.state = 'failed';
  state.mission.text = `Job failed: ${reason}. Talk to the crew to try again.`;
  state.player.hasPackage = false;
  emit(state, { type: 'mission-fail', index: state.mission.index, reason });
}

function completeMission(state) {
  const def = MISSIONS[state.mission.index];
  const reward = state.mission.reward || (def ? def.reward : 0);
  state.player.cash += reward;
  state.stats.missionsDone += 1;
  state.mission.state = 'done';
  state.mission.text = `${def ? def.title : 'Job'} complete — $${reward} paid.`;
  state.player.hasPackage = false;
  emit(state, { type: 'cash', amount: reward });
  emit(state, { type: 'mission-complete', index: state.mission.index, reward });
  if (state.mission.index === MISSIONS.length - 1) {
    state.screen = 'complete';
  }
}

const STEP_HINTS = {
  goto: 'Go to the marker.',
  pickup: 'Pick up the package.',
  deliver: 'Deliver the package.',
  steal: 'Take a sport car.',
};

function advanceStep(state) {
  const steps = state.mission.steps || [];
  state.mission.step += 1;
  if (state.mission.step >= steps.length) {
    completeMission(state);
    return;
  }
  const next = steps[state.mission.step];
  state.mission.target = next.target;
  state.mission.radius = next.radius;
  state.mission.timer = next.timer;
  state.mission.timeLeft = next.timer;
  state.mission.text = STEP_HINTS[next.type] || 'Follow the marker.';
}

// Advance the active mission one fixed step: arrival checks, the step timer,
// and completion / failure. Call once per fixed step with dt in seconds.
export function updateMission(state, dt) {
  const m = state.mission;
  if (!m || m.state !== 'active') return;
  const steps = m.steps || [];
  const current = steps[m.step];
  if (!current) {
    completeMission(state);
    return;
  }

  // A timed step: the clock running out blows the job.
  if (current.timer > 0) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      m.timeLeft = 0;
      failMission(state, 'out of time');
      return;
    }
  }

  // Steal: getting behind the wheel of a sport car is the whole step.
  if (current.type === 'steal') {
    const car = playerCar(state);
    if (car && car.kind === 'sport') advanceStep(state);
    return;
  }

  if (distanceToTarget(state, current.target) > current.radius) return;

  if (current.type === 'pickup') {
    state.player.hasPackage = true;
    emit(state, { type: 'pickup' });
    advanceStep(state);
    return;
  }
  if (current.type === 'deliver') {
    if (!state.player.hasPackage) return;
    state.player.hasPackage = false;
    advanceStep(state);
    return;
  }
  // 'goto' and anything else: arriving is enough.
  advanceStep(state);
}

// The marker the HUD minimap and the world beacon point at, or null when no
// mission is running.
export function missionMarker(state) {
  const m = state.mission;
  if (!m || m.state !== 'active' || !m.target) return null;
  return { x: m.target.x, z: m.target.z };
}
