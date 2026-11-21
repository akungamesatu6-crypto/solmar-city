// Harbor Heat — Solmar Bay. Police pursuit: keep up to `wanted` pursuit cars
// on the road, chase the player, ram the player's car, and bust the player on
// foot after a 2 s touch. Wanted decays once the heat is far away.
// Logic only, no three.js, no unseeded randomness. (No combat.js import here —
// combat.js imports addWanted from this file, so ram damage is inline.)
import { CITY, WANTED_MAX } from './config.js';
import { clampToCity, collidesBuilding, nearestRoadPoint } from './world.js';

// Softer chase balance than the first build: pursuit top speed 27.6 m/s,
// about 8% below the old 30 m/s, so a clean getaway at full speed is
// feasible while a pursuit still catches a slow or cornering driver.
const POLICE_TOP_SPEED = 27.6;
const POLICE_ACCEL = 14;
const DESPAWN_DIST = 250;
const DECAY_DIST = 60;
const DECAY_TIME = 8;
const BUST_DIST = 3;
const BUST_TIME = 2;
const RAM_DIST = 4.2;
const RAM_DAMAGE = 8;
const RAM_COOLDOWN = 1;
const SPAWN_DIST = 80;
const SPAWN_COOLDOWN = 0.7;

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function easeHeading(heading, target, maxStep) {
  const d = wrapAngle(target - heading);
  if (d > maxStep) return heading + maxStep;
  if (d < -maxStep) return heading - maxStep;
  return target;
}

/** Per-game pursuit timers, kept on the state. Resets if time runs backwards. */
function pursuitTimers(state) {
  if (!state._police) state._police = { touch: 0, clear: 0, spawnCd: 0, nextId: 1, seen: 0 };
  const t = state._police;
  if (state.time < t.seen) {
    t.touch = 0;
    t.clear = 0;
    t.spawnCd = 0;
  }
  t.seen = state.time;
  return t;
}

/** Where the player is right now: the driven car, or the player on foot. */
function playerPosition(state) {
  const p = state.player;
  if (!p.onFoot && p.carId !== null) {
    const car = state.cars.find((c) => c.id === p.carId);
    if (car) return { x: car.x, z: car.z };
  }
  return { x: p.x, z: p.z };
}

function playerDrivenCar(state) {
  const p = state.player;
  if (p.onFoot || p.carId === null) return null;
  return state.cars.find((c) => c.id === p.carId) || null;
}

function pursuitCars(state) {
  return state.cars.filter((c) => c.kind === 'police' && c.driver === 'police');
}

function removePursuitCars(state, keep) {
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.kind === 'police' && car.driver === 'police' && !keep(car)) {
      state.cars.splice(i, 1);
    }
  }
}

/**
 * Maintain the pursuit: spawn up to `wanted` cars on a road ~80 m from the
 * player (one at a time, at most one every 0.7 s), despawn them beyond 250 m,
 * chase and ram the player's car, and bust the player on foot after a unit
 * stays within 3 m for 2 s cumulative. The busted screen itself is main.js's
 * job: this pushes the `busted` event and drops the player's health low.
 */
export function updatePolice(state, dt, city) {
  const t = pursuitTimers(state);
  const player = state.player;
  const wanted = player.wanted | 0;
  const pos = playerPosition(state);
  if (t.spawnCd > 0) t.spawnCd -= dt;

  // Drop pursuit cars that have fallen far behind.
  removePursuitCars(state, (car) => dist2d(car.x, car.z, pos.x, pos.z) <= DESPAWN_DIST);

  // Heat off: the pursuit stands down entirely.
  if (wanted === 0) {
    removePursuitCars(state, () => false);
    t.touch = 0;
    return;
  }

  // Reinforcements: one new unit at a time, on a road ~80 m out.
  let police = pursuitCars(state);
  if (police.length < wanted && t.spawnCd <= 0) {
    const angle = state.rng() * Math.PI * 2;
    const road = nearestRoadPoint(
      pos.x + Math.sin(angle) * SPAWN_DIST,
      pos.z + Math.cos(angle) * SPAWN_DIST,
    );
    const clamped = clampToCity(road.x, road.z);
    const heading = Math.atan2(pos.x - clamped.x, pos.z - clamped.z);
    state.cars.push({
      id: `police-${t.nextId}`,
      kind: 'police',
      color: '#22303e',
      x: clamped.x,
      z: Math.min(clamped.z, CITY.BOUND),
      heading,
      speed: 0,
      driver: 'police',
      health: 100,
      honk: false,
    });
    t.nextId += 1;
    t.spawnCd = SPAWN_COOLDOWN;
    state.events.push({ type: 'siren', x: clamped.x, z: clamped.z });
    police = pursuitCars(state);
  }

  // Chase: steer at the player and ram the player's car on contact.
  const pcar = playerDrivenCar(state);
  for (const car of police) {
    if (car._ramCd === undefined) car._ramCd = 0;
    if (car._ramCd > 0) car._ramCd -= dt;
    const desired = Math.atan2(pos.x - car.x, pos.z - car.z);
    car.heading = easeHeading(car.heading, desired, 2.6 * dt);
    car.speed = Math.min(POLICE_TOP_SPEED, car.speed + POLICE_ACCEL * dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const clamped = clampToCity(nx, nz);
    if (city && collidesBuilding(city, clamped.x, clamped.z, 2)) {
      car.heading += 0.7; // blocked: swing around the building
      car.speed *= 0.6;
    } else {
      car.x = clamped.x;
      car.z = Math.min(clamped.z, CITY.BOUND);
    }
    const d = dist2d(car.x, car.z, pos.x, pos.z);
    if (pcar && d < RAM_DIST && car._ramCd <= 0) {
      car._ramCd = RAM_COOLDOWN;
      const rx = pos.x - car.x;
      const rz = pos.z - car.z;
      const rl = Math.hypot(rx, rz) || 1;
      // Shove the car away from the ram — but never into a building (a pin
      // against a wall would wedge the car with no way out).
      const shoveX = (rx / rl) * 1.5;
      const shoveZ = (rz / rl) * 1.5;
      if (!city || !collidesBuilding(city, pcar.x + shoveX, pcar.z + shoveZ, 2)) {
        pcar.x += shoveX;
        pcar.z += shoveZ;
        const pc = clampToCity(pcar.x, pcar.z);
        pcar.x = pc.x;
        pcar.z = pc.z;
      }
      pcar.health = Math.max(0, pcar.health - RAM_DAMAGE);
      if (pcar.health <= 0) {
        // Wrecked: the car dies and the player is thrown out on foot.
        pcar.speed = 0;
        pcar.driver = 'none';
        pcar.smoke = true;
        player.onFoot = true;
        player.carId = null;
        player.x = pcar.x;
        player.z = pcar.z;
        player.speed = 0;
      } else {
        pcar.speed *= 0.5;
      }
      car.speed *= 0.6;
      state.events.push({ type: 'police-ram', x: pcar.x, z: pcar.z });
    }
  }

  // On foot, a unit sitting on the player for 2 s cumulative makes the bust.
  if (player.onFoot) {
    let touching = false;
    for (const car of police) {
      if (dist2d(car.x, car.z, player.x, player.z) < BUST_DIST) {
        touching = true;
        break;
      }
    }
    if (touching) {
      t.touch += dt;
      if (t.touch >= BUST_TIME) {
        t.touch = 0;
        player.health = Math.min(player.health, 10);
        state.events.push({ type: 'busted', x: player.x, z: player.z });
      }
    } else {
      t.touch = Math.max(0, t.touch - dt * 2);
    }
  } else {
    t.touch = 0;
  }
}

/** Raise or lower wanted, clamped to 0..WANTED_MAX, with a HUD event. */
export function addWanted(state, n) {
  const before = state.player.wanted | 0;
  const after = clampNum(before + n, 0, WANTED_MAX);
  if (after === before) return after;
  state.player.wanted = after;
  state.events.push({ type: after > before ? 'wanted-up' : 'wanted-down', wanted: after });
  return after;
}

/** Wanted falls by 1 when no pursuit car has been within 60 m for 8 s. */
export function decayWanted(state, dt) {
  if ((state.player.wanted | 0) <= 0) return;
  const t = pursuitTimers(state);
  const pos = playerPosition(state);
  const near = pursuitCars(state).some((c) => dist2d(c.x, c.z, pos.x, pos.z) < DECAY_DIST);
  if (near) {
    t.clear = 0;
    return;
  }
  t.clear += dt;
  if (t.clear >= DECAY_TIME) {
    t.clear = 0;
    addWanted(state, -1);
  }
}
