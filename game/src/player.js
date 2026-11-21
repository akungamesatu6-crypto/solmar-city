// The player on foot. Movement is heading-relative (W/S walk along the heading,
// A/D turn, Shift sprints), walls stop the player axis by axis, and entering,
// exiting and punching live here. Driving itself is in vehicles.js: while the
// player is in a car, updatePlayer is a no-op and updateDriving moves the car
// (and the player with it).
import { PLAYER_SPEED, WANTED_MAX } from './config.js';
import { clampToCity, collidesBuilding } from './world.js';
import { nearestCar } from './vehicles.js';

const PLAYER_RADIUS = 0.6;

// The city updatePlayer last saw. exitCar takes no city argument, so it reuses
// this one for the single check that keeps the player from stepping out into a wall.
let lastCity = null;

/** One on-foot step. Does nothing while the player is driving. */
export function updatePlayer(state, input, dt, city) {
  const p = state.player;
  lastCity = city;
  if (!p.onFoot) {
    p.speed = 0;
    return;
  }
  const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const speed = PLAYER_SPEED * (sprint ? 1.6 : 1);
  const turn = input.moveX();
  const forward = input.moveY();
  p.heading += turn * 2.6 * dt;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const vx = fx * forward * speed;
  const vz = fz * forward * speed;
  p.speed = forward === 0 ? 0 : speed;

  let nx = p.x + vx * dt;
  let nz = p.z + vz * dt;
  const clamped = clampToCity(nx, nz);
  nx = clamped.x;
  nz = clamped.z;
  // Try the full step first, then each axis on its own, so the player slides
  // along a building instead of sticking to it.
  if (!collidesBuilding(city, nx, nz, PLAYER_RADIUS)) {
    p.x = nx;
    p.z = nz;
  } else if (!collidesBuilding(city, nx, p.z, PLAYER_RADIUS)) {
    p.x = nx;
  } else if (!collidesBuilding(city, p.x, nz, PLAYER_RADIUS)) {
    p.z = nz;
  }
  if (forward !== 0) state.stats.distance += Math.abs(forward) * speed * dt;
}

/** Where the player lands when stepping out of a car: `side` metres to the
// car's left (side = +1) or right (side = -1). */
function stepOutSpot(car, side) {
  return {
    x: car.x - Math.cos(car.heading) * 2.5 * side,
    z: car.z + Math.sin(car.heading) * 2.5 * side,
  };
}

/**
 * Enter the nearest car within 4 m. A parked car is borrowed quietly (enter-car);
 * taking a car that has a driver is a theft (steal, +1 wanted, counted in stats).
 * Police cars cannot be entered. Returns true when the player got in.
 */
export function tryEnterCar(state) {
  const p = state.player;
  if (!p.onFoot) return false;
  const car = nearestCar(state, p.x, p.z, 4);
  if (!car || car.kind === 'police') return false;
  if (car.driver === 'traffic') {
    state.stats.carsStolen += 1;
    p.wanted = Math.min(WANTED_MAX, p.wanted + 1);
    state.events.push({ type: 'steal', carId: car.id });
    state.events.push({ type: 'wanted-up', wanted: p.wanted });
  } else {
    state.events.push({ type: 'enter-car', carId: car.id });
  }
  car.driver = 'player';
  p.onFoot = false;
  p.carId = car.id;
  p.x = car.x;
  p.z = car.z;
  p.heading = car.heading;
  p.speed = 0;
  return true;
}

/** Step out of the driven car, beside it, and leave it parked. Returns true on success. */
export function exitCar(state) {
  const p = state.player;
  if (p.onFoot || p.carId === null) return false;
  const car = state.cars.find((c) => c.id === p.carId) || null;
  if (car) {
    car.driver = 'parked';
    car.speed = 0;
    // Step out on the car's left side; use the right side if a wall is in the way.
    let spot = stepOutSpot(car, 1);
    const clamped = clampToCity(spot.x, spot.z);
    p.x = clamped.x;
    p.z = clamped.z;
    if (lastCity && collidesBuilding(lastCity, p.x, p.z, PLAYER_RADIUS)) {
      spot = stepOutSpot(car, -1);
      p.x = spot.x;
      p.z = spot.z;
    }
    p.heading = car.heading;
  }
  p.onFoot = true;
  p.carId = null;
  p.speed = 0;
  state.events.push({ type: 'exit-car' });
  return true;
}

/**
 * Punch: hits every pedestrian within 2.5 m in front of the player. Victims flee
 * and a punch event is pushed (traffic.js reacts to it). Returns true on a hit.
 */
export function punch(state) {
  const p = state.player;
  if (!p.onFoot) return false;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  let hit = false;
  for (const ped of state.peds) {
    const dx = ped.x - p.x;
    const dz = ped.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.5 || dist === 0) continue;
    if ((dx * fx + dz * fz) / dist < 0.5) continue;
    ped.mode = 'flee';
    hit = true;
  }
  if (hit) state.events.push({ type: 'punch' });
  return hit;
}
