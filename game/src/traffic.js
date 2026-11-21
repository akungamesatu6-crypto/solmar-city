// Harbor Heat — Solmar Bay. Ambient traffic cars and pedestrians.
// Traffic keeps to its road lane, pauses at intersections, turns there
// sometimes, and brakes for the car ahead. Peds walk the sidewalks and run
// from danger. Logic only: no three.js here, no unseeded randomness — the seeded
// RNG on state.rng supplies every random choice.
import { CITY } from './config.js';
import { ROAD_LINES, clampToCity, collidesBuilding, nearestRoadPoint } from './world.js';

const LANE_OFFSET = 3; // how far a traffic lane sits from the road centre line
const SIDEWALK_OFFSET = CITY.ROAD_W / 2 + 1.5; // 7.5 m from the centre line
const PED_COUNT = 36; // up from 24, so the sidewalks read busy
const PED_WALK_MIN = 1.1;
const PED_WALK_SPREAD = 0.5;

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

/** How far the point is from the nearest road crossing (x-line meets z-line). */
function crossingDistance(x, z) {
  let dx = Infinity;
  let dz = Infinity;
  for (const at of ROAD_LINES) {
    dx = Math.min(dx, Math.abs(x - at));
    dz = Math.min(dz, Math.abs(z - at));
  }
  return Math.hypot(dx, dz);
}

function initTrafficCar(car, rng) {
  if (car._cruise === undefined) car._cruise = 10 + rng() * 4;
  if (car._stopT === undefined) car._stopT = 0;
  if (car._turnCd === undefined) car._turnCd = 0;
  if (car._turn === undefined) car._turn = 0;
}

/**
 * Traffic cars cruise along their road lane at a steady speed, stop at
 * intersections at random, turn there at random, and brake for the car ahead
 * (including the player's car). Wrecked cars and non-traffic cars are left
 * alone. A car that reaches the city edge turns around instead of grinding
 * along the boundary.
 */
export function updateTraffic(state, dt, city) {
  const rng = state.rng;
  for (const car of state.cars) {
    if (car.driver !== 'traffic' || car.health <= 0) continue;
    initTrafficCar(car, rng);
    if (car._turnCd > 0) car._turnCd -= dt;

    // Which road are we on, and which way along it are we travelling?
    // A road {axis:'x'} is the line x = at and runs along z; {axis:'z'}
    // runs along x. We keep the lane side we are already on.
    const road = nearestRoadPoint(car.x, car.z);
    const runsAlongZ = road.axis === 'x';
    const dir = runsAlongZ
      ? (Math.cos(car.heading) >= 0 ? 1 : -1)
      : (Math.sin(car.heading) >= 0 ? 1 : -1);
    const lateral = runsAlongZ ? car.x - road.at : car.z - road.at;
    const lane = lateral >= 0 ? LANE_OFFSET : -LANE_OFFSET;
    let aimX;
    let aimZ;
    if (runsAlongZ) {
      aimX = road.at + lane;
      aimZ = car.z + dir * 12;
    } else {
      aimX = car.x + dir * 12;
      aimZ = road.at + lane;
    }
    const wantedHeading = Math.atan2(aimX - car.x, aimZ - car.z);

    // At a crossing: sometimes wait a while, sometimes turn.
    const atCrossing = crossingDistance(car.x, car.z) < 7;
    if (atCrossing && car._stopT <= 0 && car._turnCd <= 0 && rng() < dt * 0.12) {
      car._stopT = 1 + rng() * 2.5;
    }
    if (atCrossing && car._stopT <= 0 && car._turnCd <= 0 && car._turn === 0 && rng() < dt * 0.25) {
      const roll = rng();
      if (roll < 0.25) car._turn = Math.PI / 2;
      else if (roll < 0.5) car._turn = -Math.PI / 2;
      car._turnCd = 4;
    }

    let targetSpeed = car._cruise;
    if (car._stopT > 0) {
      car._stopT -= dt;
      targetSpeed = 0;
    }
    if (car._turn !== 0) {
      const step = 1.6 * dt;
      const applied = clampNum(car._turn, -step, step);
      car.heading += applied;
      car._turn -= applied;
      targetSpeed = Math.min(targetSpeed, 5);
    } else {
      car.heading = easeHeading(car.heading, wantedHeading, 1.8 * dt);
    }

    // Brake for anything ahead of us in our lane, player car included.
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of state.cars) {
      if (other === car || other.health <= 0) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > 14 || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d < 0.85) continue; // not ahead of us
      if (Math.abs(dx * fz - dz * fx) > 3) continue; // not in our lane
      if (d < 6) targetSpeed = 0;
      else targetSpeed = Math.min(targetSpeed, other.speed);
    }

    const accel = targetSpeed > car.speed ? 6 : 14; // gentle up, firm braking
    if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + accel * dt);
    else if (car.speed > targetSpeed) car.speed = Math.max(targetSpeed, car.speed - accel * dt);

    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const clamped = clampToCity(nx, nz);
    if (clamped.x !== nx || clamped.z !== nz) {
      if (car._turn === 0) car._turn = Math.PI;
      car.x = clamped.x;
      car.z = clamped.z;
    } else if (city && collidesBuilding(city, clamped.x, clamped.z, 2)) {
      // Should not happen on a road: swing away and slow down.
      car.heading += Math.PI / 2;
      car.speed *= 0.5;
    } else {
      car.x = clamped.x;
      car.z = clamped.z;
    }
  }
}

/** Pick a fresh sidewalk waypoint near the ped's current road. */
function chooseWaypoint(ped, rng, city) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const road = nearestRoadPoint(ped.x, ped.z);
    const side = rng() < 0.5 ? -1 : 1;
    const along = (rng() - 0.5) * 80; // wander up to 40 m along the road
    let tx;
    let tz;
    if (road.axis === 'x') {
      tx = road.at + SIDEWALK_OFFSET * side;
      tz = ped.z + along;
    } else {
      tx = ped.x + along;
      tz = road.at + SIDEWALK_OFFSET * side;
    }
    tx = clampNum(tx, -CITY.BOUND, CITY.BOUND);
    tz = clampNum(tz, -CITY.BOUND, CITY.BOUND); // peds never head for the sea
    if (city && collidesBuilding(city, tx, tz, 1)) continue;
    ped.tx = tx;
    ped.tz = tz;
    return;
  }
  ped.tx = ped.x;
  ped.tz = ped.z;
}

function spawnPeds(state, city) {
  const rng = state.rng;
  let seq = 1;
  const addPed = (x, z) => {
    const ped = {
      id: `ped-${seq}`,
      x,
      z,
      heading: rng() * Math.PI * 2,
      speed: 0,
      mode: 'walk',
      tx: x,
      tz: z,
      _walkSpeed: PED_WALK_MIN + rng() * PED_WALK_SPREAD,
      _fleeT: null,
    };
    seq += 1;
    state.peds.push(ped);
    chooseWaypoint(ped, rng, city);
  };
  const spots = city && city.spawns && Array.isArray(city.spawns.peds) ? city.spawns.peds : [];
  for (const spot of spots) addPed(spot.x, spot.z);
  let guard = 0;
  while (state.peds.length < PED_COUNT && guard < 300) {
    guard += 1;
    const at = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
    const along = -240 + rng() * 480;
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.5) addPed(at + SIDEWALK_OFFSET * side, along);
    else addPed(along, at + SIDEWALK_OFFSET * side);
  }
}

function stepPed(ped, dt, city) {
  const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
  const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
  const clamped = clampToCity(nx, nz);
  const cx = clamped.x;
  const cz = Math.min(clamped.z, CITY.BOUND); // peds never enter the sea
  if (city && collidesBuilding(city, cx, cz, 0.6)) return false;
  ped.x = cx;
  ped.z = cz;
  return true;
}

/**
 * Pedestrians walk the sidewalks between nearby waypoints. They flee when
 * the player's car bears down on them (within 6 m and moving fast), when a
 * shot or punch goes off nearby, or — for a position-less shot/punch event —
 * when the player is close and already wanted or moving fast. A fleeing ped
 * runs away from the threat, then goes back to walking.
 */
export function updatePeds(state, dt, city) {
  const rng = state.rng;
  if (state.peds.length === 0) spawnPeds(state, city);

  // Danger from this frame's events (shot events carry a position; punch
  // events from player.js do not) and from the last shot combat.js recorded,
  // which survives the per-frame event drain in game.js.
  const shotSpots = [];
  let loudDanger = false;
  for (const ev of state.events) {
    if (ev.type === 'shot' || ev.type === 'punch') {
      if (typeof ev.x === 'number' && typeof ev.z === 'number') shotSpots.push(ev);
      else loudDanger = true;
    }
  }
  const lastShot = state._lastShot;
  if (lastShot && state.time - lastShot.time < 1.5) shotSpots.push(lastShot);

  const player = state.player;
  let threatX = player.x;
  let threatZ = player.z;
  let threatSpeed = Math.abs(player.speed);
  if (!player.onFoot && player.carId !== null) {
    const driven = state.cars.find((c) => c.id === player.carId);
    if (driven) {
      threatX = driven.x;
      threatZ = driven.z;
      threatSpeed = Math.abs(driven.speed);
    }
  }

  for (const ped of state.peds) {
    if (ped._walkSpeed === undefined) ped._walkSpeed = PED_WALK_MIN + rng() * PED_WALK_SPREAD;
    if (ped.mode === 'flee' && ped._fleeT === null) ped._fleeT = 2; // set by punch()

    let fleeFrom = null;
    for (const spot of shotSpots) {
      if (dist2d(ped.x, ped.z, spot.x, spot.z) < 18) {
        fleeFrom = spot;
        break;
      }
    }
    if (!fleeFrom && dist2d(ped.x, ped.z, threatX, threatZ) < 6 && threatSpeed > 8) {
      fleeFrom = { x: threatX, z: threatZ };
    }
    if (!fleeFrom && loudDanger && dist2d(ped.x, ped.z, threatX, threatZ) < 10
      && (player.wanted > 0 || threatSpeed > 4)) {
      fleeFrom = { x: threatX, z: threatZ };
    }
    if (fleeFrom) {
      ped.mode = 'flee';
      ped._fleeT = 2 + rng() * 1.5;
      ped._fleeX = fleeFrom.x;
      ped._fleeZ = fleeFrom.z;
    }

    if (ped.mode === 'flee') {
      ped._fleeT -= dt;
      const fx = ped._fleeX !== undefined ? ped._fleeX : threatX;
      const fz = ped._fleeZ !== undefined ? ped._fleeZ : threatZ;
      ped.heading = Math.atan2(ped.x - fx, ped.z - fz);
      ped.speed = 5;
      stepPed(ped, dt, city);
      if (ped._fleeT <= 0) {
        ped.mode = 'walk';
        ped._fleeT = null;
        chooseWaypoint(ped, rng, city);
      }
      continue;
    }

    ped.mode = 'walk';
    if (ped.tx === undefined || ped.tz === undefined) chooseWaypoint(ped, rng, city);
    const dx = ped.tx - ped.x;
    const dz = ped.tz - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      chooseWaypoint(ped, rng, city);
      ped.speed = 0;
      continue;
    }
    ped.heading = Math.atan2(dx, dz);
    ped.speed = ped._walkSpeed;
    if (!stepPed(ped, dt, city)) chooseWaypoint(ped, rng, city);
  }
}
