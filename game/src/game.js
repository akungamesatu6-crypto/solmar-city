// Harbor Heat — Solmar Bay. Assembles every system into one game object.
//
// createGame(canvas, seed) → { state, city, renderer, hud, audio, input,
//   update(dt), draw(screen), reset() }
//
// Update order (fixed by INTERFACES.md): input → player/driving → traffic → peds →
// police → missions → combat timers → event drain (hud.update + audio hooks) → clear
// events. update() runs once per fixed STEP (1/60 s) from the main loop. Screen
// changes (title / play / paused / busted / complete) are owned by main.js, which
// reads the screen-action queue; game.js reads only the gameplay-action queue
// (see input.js).
import { CAR_TOP_SPEED, PLAYER_SPEED } from './config.js';
import { createGameState, resetState } from './state.js';
import { generateCity } from './world.js';
import { createRenderer } from './render.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_SHOOT, createInput } from './input.js';
import { exitCar, punch, tryEnterCar, updatePlayer } from './player.js';
import { spawnCars, updateDriving } from './vehicles.js';
import { updatePeds, updateTraffic } from './traffic.js';
import { decayWanted, updatePolice } from './police.js';
import { shoot } from './combat.js';
import { MISSIONS, startMission, updateMission } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

export function createGame(canvas, seed) {
  const state = createGameState(seed);
  const city = generateCity(state.rng);
  const renderer = createRenderer(canvas, city);
  const hud = createHud();
  const audio = createAudio();
  const input = createInput(canvas);

  // Place the player and the first cars where the city says they belong.
  state.player.x = city.spawns.player.x;
  state.player.z = city.spawns.player.z;
  spawnCars(state, city);

  // True while the previous update ran on the play screen. The press that started
  // the game (or resumed it) also raised a SHOOT bit in the gameplay queue, so the
  // first play step after a screen change throws stale gameplay actions away
  // instead of firing the pistol by accident.
  let wasPlay = false;

  // Countdown between jobs: a finished mission rolls into the next one, and a
  // failed one is offered again, two seconds after it ends — so the story never
  // stalls on a done/failed mission with nothing active.
  let nextMissionIn = 2;

  function drainEvents() {
    // HUD and audio react to what happened this step; then the queue is cleared
    // so the next step starts empty (game.js owns the drain).
    for (const event of state.events) {
      if (event.type === 'pickup') audio.pickup();
      else if (event.type === 'cash') audio.cash();
      else if (event.type === 'shot') audio.shot();
      else if (event.type === 'punch') audio.punch();
      else if (event.type === 'mission-complete') audio.cash();
      else if (event.type === 'siren') audio.siren(true);
      else if (event.type === 'wanted-up') audio.siren(true);
      else if (event.type === 'wanted-down' && state.player.wanted === 0) audio.siren(false);
      else if (event.type === 'busted') {
        audio.siren(false);
        audio.music(false);
      }
    }
    hud.update(state, state.screen);
    hud.drawMinimap(state, city);
    state.events.length = 0;
  }

  /** After a mission ends, wait out the breather, then open the next job (or
  // retry the failed one). */
  function rollNextMission(dt) {
    const m = state.mission;
    if (m.state === 'done' && m.index < MISSIONS.length - 1) {
      nextMissionIn -= dt;
      if (nextMissionIn <= 0) startMission(state, m.index + 1, city);
    } else if (m.state === 'failed') {
      nextMissionIn -= dt;
      if (nextMissionIn <= 0) startMission(state, m.index, city);
    } else {
      nextMissionIn = 2;
    }
  }

  function update(dt) {
    state.time += dt;

    if (state.screen !== 'play') {
      // Every screen except play idles the same way: traffic and pedestrians
      // keep moving behind the title, everything else is frozen. Screen changes
      // are owned by main.js; game.js only reads gameplay actions.
      wasPlay = false;
      if (state.screen === 'title') {
        updateTraffic(state, dt, city);
        updatePeds(state, dt, city);
      }
      drainEvents();
      return;
    }

    // Screen is 'play' from here on.
    const actions = input.takeGameActions();
    if (!wasPlay) {
      // First play step after a screen change: drop any stale gameplay press
      // (the Space / click that started or resumed the game also raised SHOOT).
      wasPlay = true;
      drainEvents();
      return;
    }

    // A fresh run opens with the first Harbor Crew job; main.js starts play by
    // resetting and setting the screen directly, so the mission starts here.
    if (state.mission.index === -1 && state.mission.state === 'idle') {
      startMission(state, 0, city);
    }

    // 1. Input actions.
    if (actions & ACTION_ENTER) {
      if (state.player.onFoot) tryEnterCar(state);
      else exitCar(state);
    }
    if (actions & ACTION_PUNCH) punch(state);
    if (actions & ACTION_SHOOT) shoot(state);

    // 2. Player on foot, or driving.
    if (state.player.onFoot) updatePlayer(state, input, dt, city);
    else updateDriving(state, input, dt, city);

    // 3. Traffic, then pedestrians.
    updateTraffic(state, dt, city);
    updatePeds(state, dt, city);

    // 4. Police, then wanted decay.
    updatePolice(state, dt, city);
    decayWanted(state, dt);

    // 5. Missions.
    updateMission(state, dt);
    rollNextMission(dt);

    // 6. Combat timers: being out of health ends the run; finishing the last
    // mission ends the story.
    if (state.player.health <= 0) {
      state.player.health = 0;
      state.screen = 'busted';
      state.events.push({ type: 'busted' });
    } else if (
      state.mission.index === MISSIONS.length - 1 &&
      state.mission.state === 'done'
    ) {
      state.screen = 'complete';
    }

    // Engine hum follows how fast the player is moving.
    let speed01 = 0;
    if (state.player.onFoot) speed01 = state.player.speed / PLAYER_SPEED / 3;
    else {
      const car = state.cars.find((c) => c.id === state.player.carId);
      if (car) speed01 = Math.min(1, Math.abs(car.speed) / CAR_TOP_SPEED);
    }
    audio.engine(speed01);

    // 7. Drain events (hud.update + audio hooks), then clear them.
    drainEvents();
  }

  function draw(screen, viewOverride) {
    const p = state.player;
    let mode = 'chase';
    let target = { x: p.x, z: p.z };
    let heading = p.heading;
    if (screen === 'title') {
      mode = 'title';
    } else if (p.onFoot) {
      mode = 'foot';
    } else {
      const car = state.cars.find((c) => c.id === p.carId);
      if (car) {
        target = { x: car.x, z: car.z };
        heading = car.heading;
      }
    }
    // A caller (screenshot staging) may pin the camera: mode, target, heading.
    const view = viewOverride || { mode, target, heading };
    renderer.draw(state, screen, view);
  }

  function reset() {
    resetState(state);
    state.player.x = city.spawns.player.x;
    state.player.z = city.spawns.player.z;
    spawnCars(state, city);
    input.clear();
    audio.engine(0);
    audio.siren(false);
    audio.music(false);
    hud.update(state, state.screen);
    hud.drawMinimap(state, city);
  }

  return { state, city, renderer, hud, audio, input, update, draw, reset };
}
