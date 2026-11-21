// Screenshot scenes behind ?shot=start|play|chase|mission (always &seed=1).
// Each scene plays the real game forward from a fresh state for a fixed number
// of 1/60 s steps, steered by a scripted autopilot that writes into the same
// input object a keyboard produces (keys Set + takeActions), so every frame is
// what a short session really looks like — and the same seed always gives the
// same frame. Fully seeded — no unseeded randomness anywhere here.
import { STEP } from './config.js';
import { startMission, updateMission } from './missions.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 10;
const CHASE_SECONDS = 5;
const MISSION_SETTLE_SECONDS = 1;
const PLAY_CRUISE = 10;
const CHASE_CRUISE = 15;

// The play-shot route: straight down the x = 36 avenue from the middle of
// town to the promenade, then east and back through the central crossroads.
// It starts in the middle of town (not at the edge) so the whole shot is
// spent on busy avenues, and every waypoint is a road intersection where
// traffic and pedestrians gather.
const DRIVE_LOOP = [
  { x: 36, z: 180 },
  { x: 180, z: 180 },
  { x: 180, z: 36 },
  { x: 36, z: 36 },
  { x: 36, z: -108 },
  { x: -36, z: -108 },
  { x: -36, z: 36 },
  { x: -180, z: 36 },
  { x: -180, z: 180 },
];

// Extra traffic cars staged along the play route, so the frame reads busy.
// The player starts at (36, -36) and holds ~10 m/s for 10 s, ending near
// z = 60. The avenue convoy is therefore staged just PAST the z = 36
// crossing: a car that stops or turns there ends up behind the player and
// out of frame (the previous staging turned all four avenue cars east at
// z = 36, which is what emptied the shot). Each convoy car cruises at
// 5 m/s (set via _cruise — initTrafficCar only fills it in when
// undefined), so over the drive it travels ~50 m and ends 35-85 m ahead
// of the player, still on the avenue. _turnCd: 999 keeps staged cars from
// randomly stopping or turning at crossings, so the framing is exactly
// what is staged here. The cross-street pair runs at 8 m/s for 10 s
// (~80 m), timed to be crossing the x = 36 avenue ~45 m ahead of the
// player at capture time. Fixed positions, no randomness — the seeded
// world plus these cars is the same every run.
const STAGED_TRAFFIC = [
  { kind: 'sedan', color: '#d94f3d', x: 36, z: 48, heading: 0, speed: 5, cruise: 5 },
  { kind: 'taxi', color: '#f7c948', x: 36, z: 60, heading: 0, speed: 5, cruise: 5 },
  { kind: 'sport', color: '#e8c33d', x: 36, z: 72, heading: 0, speed: 5, cruise: 5 },
  { kind: 'sedan', color: '#3d7bd9', x: 36, z: 84, heading: 0, speed: 5, cruise: 5 },
  { kind: 'truck', color: '#e8e8e8', x: 36, z: 96, heading: 0, speed: 5, cruise: 5 },
  { kind: 'sedan', color: '#7fb069', x: -24, z: 108, heading: Math.PI / 2, speed: 8, cruise: 8 },
  { kind: 'taxi', color: '#f7c948', x: 84, z: 108, heading: -Math.PI / 2, speed: 8, cruise: 8 },
];

// Extra pedestrians on the sidewalks beside the play route, so the avenues
// read crowded: both sides of x = 36, staged AHEAD of where the player ends
// up (~z 60), at z = 66..168, so they are 10-110 m ahead in frame at
// capture time. They walk slowly (~1.2 m/s), so they stay near their spots.
// Numeric ids keep them distinct from the spawned peds (which use strings).
const STAGED_PEDS = [
  { x: 45, z: 66 }, { x: 27, z: 72 }, { x: 45, z: 84 }, { x: 27, z: 96 },
  { x: 45, z: 108 }, { x: 27, z: 120 }, { x: 45, z: 132 }, { x: 27, z: 144 },
  { x: 45, z: 156 }, { x: 27, z: 168 },
];

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Put the player behind the wheel of a sedan (parked or traffic), placed at a
// fixed spot on the x = 36 avenue facing south, so the autopilot starts on a
// road and on its loop — never beelining across blocks from a random spot.
// The play shot starts mid-town (z = -36) so the drive is busy from frame one.
function seatPlayerInSedan(game) {
  const { state } = game;
  let sedan = state.cars.find((c) => c.kind === 'sedan' && c.driver !== 'player');
  if (!sedan) {
    sedan = {
      id: `shot-sedan-${state.cars.length}`,
      kind: 'sedan',
      color: '#c0392b',
      x: 36,
      z: -36,
      heading: 0,
      speed: 0,
      driver: 'parked',
      health: 100,
      honk: 0,
    };
    state.cars.push(sedan);
  }
  sedan.x = 36;
  sedan.z = -36;
  sedan.heading = 0;
  sedan.speed = 0;
  state.player.x = sedan.x;
  state.player.z = sedan.z;
  state.player.heading = sedan.heading;
  state.player.onFoot = false;
  state.player.carId = sedan.id;
  sedan.driver = 'player';
  sedan.speed = 0;
  return sedan;
}

// Stage the extra traffic cars and pedestrians for the play shot. They join
// the seeded traffic and walk the same sidewalks, so the shot shows a street
// full of cars and people instead of an empty avenue.
function stageBusyStreet(game) {
  const { state } = game;
  for (let i = 0; i < STAGED_TRAFFIC.length; i += 1) {
    const spot = STAGED_TRAFFIC[i];
    state.cars.push({
      id: `shot-traffic-${i}`,
      kind: spot.kind,
      color: spot.color,
      x: spot.x,
      z: spot.z,
      heading: spot.heading,
      speed: spot.speed,
      driver: 'traffic',
      health: 100,
      honk: 0,
      // Staged cruise speed (traffic.js only fills _cruise in when it is
      // undefined) and a long turn cooldown, so staged cars drive straight
      // at their staged speed instead of randomly stopping or turning at
      // crossings mid-shot.
      _cruise: spot.cruise,
      _turnCd: 999,
      _stopT: 0,
      _turn: 0,
    });
  }
  for (let i = 0; i < STAGED_PEDS.length; i += 1) {
    const spot = STAGED_PEDS[i];
    state.peds.push({
      id: 9001 + i,
      x: spot.x,
      z: spot.z,
      heading: 0,
      speed: 0,
      mode: 'walk',
      tx: spot.x,
      tz: spot.z,
      _walkSpeed: 1.2,
      _fleeT: null,
    });
  }
}

// Autopilot state, kept across the steps of one staged scene: which loop
// waypoint is next, how long the car has been stuck, and a reverse-out timer.
function createPilot() {
  return { waypoint: 0, stuck: 0, reverseT: 0 };
}

// One autopilot step: hold the accelerator and steer toward the next loop
// waypoint, but slow for corners (coast while turning, brake near a
// waypoint) and reverse out if wedged against a building for a second.
// `pilot` is the object createPilot returns; `cruise` is the target speed.
function driveStep(game, pilot, cruise) {
  const { state, input } = game;
  const car = state.cars.find((c) => c.id === state.player.carId);
  if (!car) return pilot;
  const target = DRIVE_LOOP[pilot.waypoint % DRIVE_LOOP.length];
  if (Math.hypot(target.x - car.x, target.z - car.z) < 14) pilot.waypoint += 1;
  const goal = DRIVE_LOOP[pilot.waypoint % DRIVE_LOOP.length];
  const desired = Math.atan2(goal.x - car.x, goal.z - car.z);
  const diff = wrapAngle(desired - car.heading);
  const dist = Math.hypot(goal.x - car.x, goal.z - car.z);
  const speed = Math.abs(car.speed || 0);

  input.keys.clear();
  if (pilot.reverseT > 0) {
    // Backing out of a wedge: reverse, steering with the turn (the driving
    // model flips steering while reversing, so the same sign swings the car).
    pilot.reverseT -= 1;
    input.keys.add('KeyS');
    if (diff > 0.12) input.keys.add('KeyD');
    else if (diff < -0.12) input.keys.add('KeyA');
    return pilot;
  }
  if (speed < 0.5) {
    pilot.stuck += 1;
    if (pilot.stuck > 60) {
      pilot.stuck = 0;
      pilot.reverseT = 70;
      return pilot;
    }
  } else {
    pilot.stuck = 0;
  }
  // Corners: coast while the nose is well off the goal, brake close in.
  if (Math.abs(diff) > 0.6) {
    // No throttle: let the car turn without running wide into a block.
  } else if (dist < 26 && speed > 5) {
    input.keys.add('KeyS');
  } else if (speed < cruise) {
    input.keys.add('KeyW');
  }
  if (diff > 0.12) input.keys.add('KeyD');
  else if (diff < -0.12) input.keys.add('KeyA');
  return pilot;
}

function runSteps(game, seconds, steer, cruise) {
  const pilot = createPilot();
  const total = Math.round(seconds / STEP);
  for (let i = 0; i < total; i += 1) {
    if (steer) driveStep(game, pilot, cruise || PLAY_CRUISE);
    game.update(STEP);
  }
}

// Straight-line pursuit driving for the chase scene: hold south down the
// x = 36 avenue at cruise speed, correcting gently back to the lane when a
// ram shoves the car sideways. No turns, so the car cannot wedge itself
// against a block — the failure the waypoint loop kept hitting under fire.
function runStraightChase(game, seconds, cruise) {
  const pilot = createPilot();
  const total = Math.round(seconds / STEP);
  for (let i = 0; i < total; i += 1) {
    const { state, input } = game;
    const car = state.cars.find((c) => c.id === state.player.carId);
    if (car) {
      const speed = Math.abs(car.speed || 0);
      input.keys.clear();
      if (pilot.reverseT > 0) {
        pilot.reverseT -= 1;
        input.keys.add('KeyS');
      } else {
        if (speed < 0.5) {
          pilot.stuck += 1;
          if (pilot.stuck > 60) {
            pilot.stuck = 0;
            pilot.reverseT = 60;
          }
        } else {
          pilot.stuck = 0;
        }
        // Lane discipline: steer back toward x = 36, aiming at a point 30 m
        // ahead on the lane so the return angle is strong enough to beat a
        // ram's sideways shove; else hold heading 0 (due south).
        const off = car.x - 36;
        if (Math.abs(off) > 2) {
          const want = Math.atan2(36 - car.x, 30);
          const diff = wrapAngle(want - car.heading);
          if (diff > 0.1) input.keys.add('KeyD');
          else if (diff < -0.1) input.keys.add('KeyA');
        } else {
          const diff = wrapAngle(0 - car.heading);
          if (diff > 0.1) input.keys.add('KeyD');
          else if (diff < -0.1) input.keys.add('KeyA');
        }
        if (speed < cruise) input.keys.add('KeyW');
        else if (speed > cruise + 4) input.keys.add('KeyS');
      }
    }
    game.update(STEP);
  }
}

function addPoliceCar(game, dx, dz) {
  const { state } = game;
  const car = state.cars.find((c) => c.id === state.player.carId);
  const baseX = car ? car.x : state.player.x;
  const baseZ = car ? car.z : state.player.z;
  const baseHeading = car ? car.heading : state.player.heading;
  const police = {
    id: `shot-police-${state.cars.length}`,
    kind: 'police',
    color: '#1c2733',
    x: baseX + dx,
    z: baseZ + dz,
    heading: baseHeading,
    speed: 6,
    driver: 'police',
    health: 100,
    honk: 0,
  };
  state.cars.push(police);
  return police;
}

// A wide, high camera over the player's car: it shows more of the street —
// the traffic ahead, the cars crossing, the pedestrians on the sidewalks —
// than the close chase camera does.
function wideView(game) {
  const { state } = game;
  const car = state.cars.find((c) => c.id === state.player.carId);
  if (!car) return undefined;
  return { mode: 'pursuit', target: { x: car.x, z: car.z }, heading: car.heading };
}

// Stage the named scene on a fresh game and return the screen to draw.
// Names: start, play, chase, mission. Any other name stages start.
export function stageShot(name, game) {
  const { state } = game;
  game.reset();
  state.screen = 'play';

  if (name === 'play') {
    seatPlayerInSedan(game);
    stageBusyStreet(game);
    runSteps(game, PLAY_SECONDS, true, PLAY_CRUISE);
    // Wide high camera: the staged traffic and pedestrians stay in frame.
    return { screen: 'play', best: 0, view: wideView(game) };
  }

  if (name === 'chase') {
    seatPlayerInSedan(game);
    state.player.wanted = 3;
    state.events.push({ type: 'wanted-up', wanted: 3 });
    // Start the pursuit from directly behind on the same avenue, so the rams
    // shove the car forward down the road instead of sideways into a wall.
    addPoliceCar(game, 0, -28);
    addPoliceCar(game, 0, -32);
    runStraightChase(game, CHASE_SECONDS, CHASE_CRUISE);
    state.player.wanted = 3;
    // Wide high camera: the trailing police sit between the camera and the
    // player car, so the pursuit is in the frame.
    return { screen: 'play', best: 0, view: wideView(game) };
  }

  if (name === 'mission') {
    // Harbor Delivery, already past the garage pickup: the player stands on
    // the pier with the package, about to finish the delivery.
    startMission(state, 1, game.city);
    const garage = state.mission.target;
    state.player.x = garage.x;
    state.player.z = garage.z;
    state.player.onFoot = true;
    state.player.carId = null;
    updateMission(state, STEP);
    const pier = state.mission.target;
    // Stand on the pier deck just short of the delivery marker (10 m out, so
    // the job is still open and the beacon is right ahead), facing back
    // toward the city — and frame it from high over the sea behind the
    // player. The old staging put the foot camera right on the promenade
    // palm line, and a palm frond filled the top-right corner; from 20 m
    // back and 18 m up over open water, the top of the frame is sky and
    // rooftops, with the palms small and low on the horizon.
    state.player.x = pier.x - 6;
    state.player.z = pier.z + 8;
    state.player.heading = Math.atan2(pier.x - state.player.x, pier.z - state.player.z);
    state.player.hasPackage = true;
    runSteps(game, MISSION_SETTLE_SECONDS, false);
    state.player.hasPackage = true;
    const view = {
      mode: 'pursuit',
      target: { x: state.player.x, z: state.player.z },
      heading: state.player.heading,
    };
    return { screen: 'play', best: 0, view };
  }

  // start (and anything unknown): title screen over the city in attract mode.
  state.screen = 'title';
  runSteps(game, START_SECONDS, false);
  state.screen = 'title';
  return { screen: 'title', best: 0 };
}
