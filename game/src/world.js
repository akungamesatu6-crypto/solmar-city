// Solmar Bay: a seeded procedural harbor city. The grid is fixed — BLOCK 60, road
// width 12, pitch 72 — and every building, prop and spawn comes from the seeded
// RNG, never unseeded randomness, so ?seed=N always rebuilds the same city.
//
// Layout: road centre lines at x and z in [-252, -180, -108, -36, 36, 108, 180, 252].
// Block centres sit between the roads at [-216, -144, -72, 0, 72, 144, 216] each way.
// City bounds are x, z in [-264, 264]; the sea starts at z > 276, and the promenade
// and pier occupy z in [264, 300].
//
// Roads list convention: { axis: 'x', at } is the road line x = at (it runs along z);
// { axis: 'z', at } is the road line z = at (it runs along x).
import { CITY, COLORS } from './config.js';

export const ROAD_LINES = [-252, -180, -108, -36, 36, 108, 180, 252];
export const BLOCK_CENTRES = [-216, -144, -72, 0, 72, 144, 216];

const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8c33d', '#e8e8e8', '#2e3238', '#7fb069', '#c98bb0', '#e07b39'];

// Named places the missions use as targets. Palms stay clear of these spots so a
// mission marker is never hidden behind a frond.
const LANDMARKS = {
  market: { x: -144, z: -144 },
  garage: { x: 144, z: 144 },
  safehouse: { x: -216, z: -216 },
  pier: { x: 0, z: 288 },
};
const PALM_CLEARANCE = 20;

/** Pick one item from an array with the seeded RNG. */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** True when (x, z) is too close to a mission landmark for a tall palm. */
function nearLandmark(x, z) {
  for (const spot of Object.values(LANDMARKS)) {
    if (Math.hypot(x - spot.x, z - spot.z) < PALM_CLEARANCE) return true;
  }
  return false;
}

/** True when (x, z) sits right beside a road centre line — a palm there would
// hang its fronds over the street and into a camera looking down the road. */
function besideRoadLine(x, z) {
  for (const at of ROAD_LINES) {
    if (Math.abs(x - at) < 7) return true;
    if (Math.abs(z - at) < 7) return true;
  }
  return false;
}

/**
 * Build the city from the seeded RNG.
 * Returns { buildings:[{x,z,w,d,h,color}], props:[{type,x,z,ry}],
 *   roads:[{axis,at}], spawns:{ player:{x,z}, cars:[{x,z,heading}], peds:[{x,z}],
 *   market:{x,z}, garage:{x,z}, safehouse:{x,z} },
 *   pier:{x,z}, landmarks:{ market:{x,z}, garage:{x,z}, safehouse:{x,z} } }.
 */
export function generateCity(rng) {
  const roads = [];
  for (const at of ROAD_LINES) {
    roads.push({ axis: 'x', at });
    roads.push({ axis: 'z', at });
  }

  const buildings = [];
  const palette = COLORS.building;
  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      // The southernmost row fronts the promenade: leave a few open plazas there.
      const roll = rng();
      if (roll < 0.12) continue; // open plaza / park, no building
      if (roll < 0.2) {
        // Twin low shops side by side inside the block.
        for (const off of [-14, 14]) {
          buildings.push({
            x: bx + off,
            z: bz,
            w: 22 + rng() * 6,
            d: 26 + rng() * 10,
            h: 7 + rng() * 6,
            color: pick(rng, palette),
          });
        }
        continue;
      }
      buildings.push({
        x: bx + (rng() - 0.5) * 6,
        z: bz + (rng() - 0.5) * 6,
        w: 26 + rng() * 26,
        d: 26 + rng() * 26,
        h: 8 + rng() * rng() * 42,
        color: pick(rng, palette),
      });
    }
  }

  const props = [];
  // Street lamps: at road intersections, one corner each, alternating sides.
  for (const rx of ROAD_LINES) {
    for (const rz of ROAD_LINES) {
      if (rng() < 0.45) continue;
      props.push({
        type: 'lamp',
        x: rx + (rng() < 0.5 ? 8 : -8),
        z: rz + (rng() < 0.5 ? 8 : -8),
        ry: rng() * Math.PI * 2,
      });
    }
  }
  // Palms and benches line the promenade (z = 270), facing the sea. A palm is
  // skipped when it would crowd a mission landmark or stand right beside a
  // road centre line, where its crown would drift into a street-level camera.
  for (let x = -252; x <= 252; x += 18) {
    if (rng() < 0.25) continue;
    const px = x + (rng() - 0.5) * 6;
    const pz = 269 + rng() * 2;
    if (!nearLandmark(px, pz) && !besideRoadLine(px, pz)) {
      props.push({ type: 'palm', x: px, z: pz, ry: rng() * Math.PI * 2 });
    }
    if (rng() < 0.5) {
      props.push({ type: 'bench', x: x + 9, z: 267.5, ry: Math.PI });
    }
  }
  // Hydrants on sidewalks beside roads, scattered through town.
  for (let i = 0; i < 16; i += 1) {
    const at = pick(rng, ROAD_LINES);
    const along = -252 + rng() * 504;
    if (rng() < 0.5) props.push({ type: 'hydrant', x: at + 8, z: along, ry: rng() * Math.PI * 2 });
    else props.push({ type: 'hydrant', x: along, z: at + 8, ry: rng() * Math.PI * 2 });
  }

  // Spawns. The player starts at the south-west road intersection, facing the sea.
  const spawns = {
    player: { x: -36, z: 180 },
    cars: [],
    peds: [],
    // Named places the missions resolve against (missions.js reads these keys).
    market: { x: -144, z: -144 },
    garage: { x: 144, z: 144 },
    safehouse: { x: -216, z: -216 },
  };
  // Parked / traffic car spawns: on road lanes, spread across town.
  const carSpots = [
    { x: -36, z: -180, heading: 0 },
    { x: 36, z: -108, heading: Math.PI },
    { x: -108, z: 36, heading: Math.PI / 2 },
    { x: 108, z: -36, heading: -Math.PI / 2 },
    { x: 180, z: 108, heading: 0 },
    { x: -180, z: 180, heading: Math.PI },
    { x: 252, z: -252, heading: Math.PI / 2 },
    { x: -252, z: 252, heading: -Math.PI / 2 },
    { x: 36, z: 252, heading: 0 },
    { x: -108, z: -252, heading: Math.PI },
    { x: 180, z: -180, heading: Math.PI / 2 },
    { x: -36, z: 108, heading: 0 },
  ];
  for (const spot of carSpots) {
    spawns.cars.push({ x: spot.x, z: spot.z, heading: spot.heading });
  }
  // Pedestrian spawns: on sidewalks beside roads.
  for (let i = 0; i < 14; i += 1) {
    const at = pick(rng, ROAD_LINES);
    const along = -240 + rng() * 480;
    if (rng() < 0.5) spawns.peds.push({ x: at + 9, z: along });
    else spawns.peds.push({ x: along, z: at + 9 });
  }

  const pier = { x: 0, z: 288 };
  const landmarks = {
    market: { x: -144, z: -144 },
    garage: { x: 144, z: 144 },
    safehouse: { x: -216, z: -216 },
  };

  return { buildings, props, roads, spawns, pier, landmarks, carColors: CAR_COLORS };
}

/** True when the point is on a road (within half the road width of a centre line). */
export function isOnRoad(x, z) {
  for (const at of ROAD_LINES) {
    if (Math.abs(x - at) <= CITY.ROAD_W / 2) return true;
    if (Math.abs(z - at) <= CITY.ROAD_W / 2) return true;
  }
  return false;
}

/** The closest point on any road centre line, with which road it belongs to. */
export function nearestRoadPoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const at of ROAD_LINES) {
    const dx = Math.abs(x - at);
    if (dx < bestD) {
      bestD = dx;
      best = { x: at, z, axis: 'x', at };
    }
    const dz = Math.abs(z - at);
    if (dz < bestD) {
      bestD = dz;
      best = { x, z: at, axis: 'z', at };
    }
  }
  return best;
}

/** True when a circle of radius r at (x, z) overlaps any building footprint. */
export function collidesBuilding(city, x, z, r) {
  return buildingAt(city, x, z, r) !== null;
}

/** The building whose footprint contains the circle of radius r at (x, z), or null. */
export function buildingAt(city, x, z, r) {
  const list = city.buildings;
  const rr = r || 0;
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    if (x + rr > b.x - b.w / 2 && x - rr < b.x + b.w / 2 && z + rr > b.z - b.d / 2 && z - rr < b.z + b.d / 2) {
      return b;
    }
  }
  return null;
}

/** Clamp a ground position to the walkable city, pier included (z up to 300). */
export function clampToCity(x, z) {
  return {
    x: Math.max(-CITY.BOUND, Math.min(CITY.BOUND, x)),
    z: Math.max(-CITY.BOUND, Math.min(300, z)),
  };
}
