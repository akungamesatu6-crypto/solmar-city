// Harbor Heat — Solmar Bay. Pistol hitscan, hurting the player, wrecking cars.
// Logic only, no three.js, no unseeded randomness. shoot() also records the shot's
// position on the state so traffic.js can react even after the per-frame
// event drain in game.js clears the `shot` event.
import { addWanted } from './police.js';

const SHOT_RANGE = 40;
const SHOT_HALF_ANGLE = (10 * Math.PI) / 180; // ~10-degree cone
const SHOT_CAR_DAMAGE = 34;

/**
 * Hitscan from the player toward where they face (the driven car's heading
 * while driving): the nearest pursuit car or ped within 40 m and inside a
 * ~10-degree cone takes the hit — a car loses 34 health, a ped flees.
 * Always pushes a `shot` event and raises wanted by 1. Returns the hit
 * target (car or ped) or null when the shot hit nothing.
 */
export function shoot(state) {
  const player = state.player;
  let ox = player.x;
  let oz = player.z;
  let aim = player.heading;
  if (!player.onFoot && player.carId !== null) {
    const car = state.cars.find((c) => c.id === player.carId);
    if (car) {
      ox = car.x;
      oz = car.z;
      aim = car.heading;
    }
  }
  state.stats.shotsFired += 1;
  const fx = Math.sin(aim);
  const fz = Math.cos(aim);
  const cosCone = Math.cos(SHOT_HALF_ANGLE);
  let best = null;
  let bestDist = SHOT_RANGE;

  // Nearest candidate inside the cone wins; cars and peds share one scan.
  const consider = (x, z, ref) => {
    const dx = x - ox;
    const dz = z - oz;
    const d = Math.hypot(dx, dz);
    if (d > bestDist || d < 0.01) return;
    if ((dx * fx + dz * fz) / d < cosCone) return;
    bestDist = d;
    best = ref;
  };
  for (const car of state.cars) {
    if (car.kind === 'police' && car.driver === 'police' && car.health > 0) {
      consider(car.x, car.z, { kind: 'car', ref: car });
    }
  }
  for (const ped of state.peds) {
    consider(ped.x, ped.z, { kind: 'ped', ref: ped });
  }

  if (best) {
    if (best.kind === 'car') {
      damageCar(best.ref, SHOT_CAR_DAMAGE);
    } else {
      const ped = best.ref;
      ped.mode = 'flee';
      ped._fleeT = 2.5;
      ped._fleeX = ox;
      ped._fleeZ = oz;
      ped.heading = Math.atan2(ped.x - ox, ped.z - oz);
    }
  }
  state.events.push({ type: 'shot', x: ox, z: oz });
  state._lastShot = { x: ox, z: oz, time: state.time };
  addWanted(state, 1);
  return best ? best.ref : null;
}

/** Hurt the player (floor 0) and push a `hit` event for the HUD/audio. */
export function damagePlayer(state, n) {
  state.player.health = Math.max(0, state.player.health - n);
  state.events.push({ type: 'hit', amount: n });
}

/**
 * Hurt a car. At 0 health the car is disabled: it stops, loses its driver,
 * and smokes.
 */
export function damageCar(car, n) {
  if (!car) return;
  car.health = Math.max(0, car.health - n);
  if (car.health <= 0) {
    car.health = 0;
    car.speed = 0;
    car.driver = 'none';
    car.smoke = true;
  }
}
