// Harbor Heat — Solmar Bay. Cars: where they start, and how the player drives one.
// Pure logic: a car is a plain data object, render.js turns it into meshes.
// Every random choice comes from state.rng (the seeded RNG); unseeded
// randomness is never used.
import { CAR_TOP_SPEED, CITY, KEYS } from './config.js';
import { ROAD_LINES, clampToCity, collidesBuilding, isOnRoad } from './world.js';

// Tuning carried over from the design: parked cars line the roadsides, and the
// moving traffic starts from the lane spots world.js lays out, plus a few extra
// seeded lane cars so the avenues read busy.
const PARKED_CARS = 26;
const EXTRA_TRAFFIC_CARS = 6;
const CAR_BODY_RADIUS = 2;
const TAXI_YELLOW = '#f7c948';
const PAINT = ['#d94f3d', '#3d7bd9', '#e8c33d', '#e8e8e8', '#2e3238', '#7fb069', '#c98bb0', '#e07b39'];

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function roadsOf(city) {
  if (city && Array.isArray(city.roads) && city.roads.length > 0) return city.roads;
  const out = [];
  for (const at of ROAD_LINES) {
    out.push({ axis: 'x', at });
    out.push({ axis: 'z', at });
  }
  return out;
}

function rollKind(rng) {
  const r = rng();
  if (r < 0.45) return 'sedan';
  if (r < 0.62) return 'taxi';
  if (r < 0.82) return 'sport';
  return 'truck';
}

function rollPaint(rng, city, kind) {
  if (kind === 'taxi') return TAXI_YELLOW;
  const palette = city && Array.isArray(city.carColors) && city.carColors.length > 0
    ? city.carColors
    : PAINT;
  return palette[Math.floor(rng() * palette.length)];
}

function buildCar(id, kind, color, x, z, heading, driver, speed) {
  return { id, kind, color, x, z, heading, speed, driver, health: 100, honk: false };
}

/**
 * Fill state.cars from scratch: PARKED_CARS parked cars tucked beside the
 * roads (never on a driving lane, never on the player's spawn), then the
 * traffic cars — one per lane spot from world.js, plus EXTRA_TRAFFIC_CARS
 * more placed on random road lanes. Returns state.cars.
 */
export function spawnCars(state, city) {
  const rng = state.rng;
  state.cars.length = 0;
  let seq = 1;
  const spawn = city && city.spawns ? city.spawns.player : null;
  const roads = roadsOf(city);
  const clearOfPlayer = (x, z) => !spawn || Math.hypot(x - spawn.x, z - spawn.z) >= 8;

  let parked = 0;
  let tries = 0;
  while (parked < PARKED_CARS && tries < 600) {
    tries += 1;
    const road = roads[Math.floor(rng() * roads.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const along = -252 + rng() * 504;
    const shoulder = (CITY.ROAD_W / 2 + 2.5) * side;
    let x;
    let z;
    let heading;
    if (road.axis === 'x') {
      // Line x = at runs along z: park beside it, nose along the road.
      x = road.at + shoulder;
      z = along;
      heading = rng() < 0.5 ? 0 : Math.PI;
    } else {
      x = along;
      z = road.at + shoulder;
      heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (!clearOfPlayer(x, z)) continue;
    if (city && collidesBuilding(city, x, z, CAR_BODY_RADIUS)) continue;
    const kind = rollKind(rng);
    state.cars.push(buildCar(`car-${seq}`, kind, rollPaint(rng, city, kind), x, z, heading, 'parked', 0));
    seq += 1;
    parked += 1;
  }

  const laneSpots = city && city.spawns && Array.isArray(city.spawns.cars)
    ? city.spawns.cars
    : [];
  for (const spot of laneSpots) {
    const kind = rollKind(rng);
    state.cars.push(buildCar(
      `car-${seq}`, kind, rollPaint(rng, city, kind),
      spot.x, spot.z, spot.heading, 'traffic', 10 + rng() * 4,
    ));
    seq += 1;
  }

  // Extra traffic beyond the fixed lane spots: pick a road, a lane side and a
  // position along it, facing down the road. Same seeded RNG, same lane rules.
  let extra = 0;
  tries = 0;
  while (extra < EXTRA_TRAFFIC_CARS && tries < 200) {
    tries += 1;
    const road = roads[Math.floor(rng() * roads.length)];
    const laneSide = rng() < 0.5 ? -1 : 1;
    const along = -252 + rng() * 504;
    let x;
    let z;
    let heading;
    if (road.axis === 'x') {
      x = road.at + 3 * laneSide;
      z = along;
      heading = laneSide > 0 ? Math.PI : 0;
    } else {
      x = along;
      z = road.at + 3 * laneSide;
      heading = laneSide > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    if (!clearOfPlayer(x, z)) continue;
    if (city && collidesBuilding(city, x, z, CAR_BODY_RADIUS)) continue;
    const kind = rollKind(rng);
    state.cars.push(buildCar(
      `car-${seq}`, kind, rollPaint(rng, city, kind),
      x, z, heading, 'traffic', 10 + rng() * 4,
    ));
    seq += 1;
    extra += 1;
  }
  return state.cars;
}

function readControls(input) {
  let steer = 0;
  let throttle = 0;
  if (input && typeof input.moveX === 'function') steer = clampNum(input.moveX(), -1, 1);
  if (input && typeof input.moveY === 'function') throttle = clampNum(input.moveY(), -1, 1);
  if (input && input.keys instanceof Set && typeof input.moveX !== 'function') {
    const k = input.keys;
    if (k.has(KEYS.D) || k.has('KeyD') || k.has('ArrowRight')) steer = 1;
    else if (k.has(KEYS.A) || k.has('KeyA') || k.has('ArrowLeft')) steer = -1;
    if (k.has(KEYS.W) || k.has('KeyW') || k.has('ArrowUp')) throttle = 1;
    else if (k.has(KEYS.S) || k.has('KeyS') || k.has('ArrowDown')) throttle = -1;
  }
  return { steer, throttle };
}

/**
 * Arcade driving for the player's car. W/S accelerate, brake and reverse;
 * A/D steer, with steering bite growing with speed and flipping in reverse.
 * Top speed is CAR_TOP_SPEED on tarmac, a little less off-road; a building
 * stops the car dead and the city edge knocks speed down. While driving, the
 * player rides along with the car. No-op on foot, or in a wrecked car.
 */
export function updateDriving(state, input, dt, city) {
  const player = state.player;
  if (player.onFoot || player.carId === null) return;
  const car = state.cars.find((c) => c.id === player.carId);
  if (!car || car.health <= 0) return;
  if (car.driver !== 'player') car.driver = 'player';

  const { steer, throttle } = readControls(input);
  const onRoad = isOnRoad(car.x, car.z);
  const grip = onRoad ? 1 : 0.85;
  const topSpeed = CAR_TOP_SPEED * (onRoad ? 1 : 0.92);
  const reverseTop = 10;

  if (throttle > 0) {
    car.speed = Math.min(topSpeed, car.speed + 16 * grip * throttle * dt);
  } else if (throttle < 0) {
    if (car.speed > 0.5) car.speed = Math.max(0, car.speed - 26 * dt);
    else car.speed = Math.max(-reverseTop, car.speed - 10 * dt);
  } else {
    const drag = 2 + Math.abs(car.speed) * 0.5;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - drag * dt);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + drag * dt);
  }

  const speedFactor = clampNum(Math.abs(car.speed) / 10, 0, 1);
  const steerRate = 2.4 * speedFactor * (onRoad ? 1 : 0.9);
  car.heading += steer * steerRate * dt * (car.speed < 0 ? -1 : 1);

  let nx = car.x + Math.sin(car.heading) * car.speed * dt;
  let nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const inside = clampToCity(nx, nz);
  if (inside.x !== nx || inside.z !== nz) {
    nx = inside.x;
    nz = inside.z;
    car.speed *= 0.3;
  }
  if (city && collidesBuilding(city, nx, nz, CAR_BODY_RADIUS)) {
    car.speed = 0;
  } else {
    car.x = nx;
    car.z = nz;
  }

  // Bump apart from any overlapping car. The speed cut is throttled to once
  // per half second per car, so a pursuit car glued to the bumper cannot
  // halve the speed sixty times a second and pin the player in place.
  if (car._bumpCd === undefined) car._bumpCd = 0;
  if (car._bumpCd > 0) car._bumpCd -= dt;
  for (const other of state.cars) {
    if (other === car || other.health <= 0) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d <= 0.01 || d >= 3.4) continue;
    const push = (3.4 - d) / 2;
    const ux = dx / d;
    const uz = dz / d;
    car.x += ux * push;
    car.z += uz * push;
    if (other.driver === 'traffic') {
      other.x -= ux * push;
      other.z -= uz * push;
    }
    if (car._bumpCd <= 0) {
      car.speed *= 0.5;
      car._bumpCd = 0.5;
    }
  }

  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  player.speed = car.speed;
  state.stats.distance += Math.abs(car.speed) * dt;
}

/** The nearest car to (x, z) within maxDist, or null when none is close. */
export function nearestCar(state, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
