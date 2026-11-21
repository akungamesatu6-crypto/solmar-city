// Boot for Harbor Heat. Reads ?shot= and ?seed= from the URL.
// Shot mode stages one screenshot scene, paints it twice and sets
// window.__shotReady. Live mode runs the fixed-step loop; game.js owns the
// screen transitions (title → play → paused / busted / complete) and the
// HUD/audio hooks, while this file owns the loop itself, save/load, the audio
// unlock gesture, and pausing when the tab hides.
import { STEP } from './config.js';
import { ACTION_CONFIRM, ACTION_PAUSE } from './input.js';
import { createGame } from './game.js';
import { stageShot } from './shots.js';
import { applySave, loadGame, saveGame } from './save.js';
import { setMissionCity } from './missions.js';

// The longest frame the loop catches up on; a longer stall is dropped
// instead of spiral-catching-up through it.
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const game = createGame(canvas, seed);
// Debug handle for play-testing (read-only from the console).
window.__game = game;
const { state, audio } = game;

// Mission targets resolve from the live city (landmarks + pier).
setMissionCity(game.city);

// A returning driver keeps their cash and finished jobs.
const saved = loadGame();
if (saved) applySave(state, saved);

let lastMissionsDone = state.stats.missionsDone || 0;

function persist() {
  saveGame(state);
  lastMissionsDone = state.stats.missionsDone || 0;
}

// Stage one screenshot scene and paint it twice (the second paint proves the
// renderer is stable on a static state), then signal the screenshot runner.
function runShot(name) {
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    game.draw(scene.screen, scene.view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let previousScreen = state.screen;

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // Screen transitions live here: title → play → paused / busted / complete.
    // (game.js owns the world update only; nothing else drains this queue.)
    const screenActions = game.input.takeActions();
    if (screenActions & ACTION_CONFIRM) {
      if (state.screen === 'title') {
        game.reset();
        state.screen = 'play';
      } else if (state.screen === 'paused') {
        state.screen = 'play';
      } else if (state.screen === 'busted' || state.screen === 'complete') {
        game.reset();
        state.screen = 'title';
      }
    }
    if (screenActions & ACTION_PAUSE) {
      if (state.screen === 'play') state.screen = 'paused';
      else if (state.screen === 'paused') state.screen = 'play';
    }

    // game.update owns every screen and its transitions; the loop just feeds
    // it fixed steps. While paused, busted or complete it still steps so its
    // own confirm-to-continue handling runs.
    while (accumulator >= STEP) {
      game.update(STEP);
      accumulator -= STEP;
    }

    // A job finished: bank the progress right away.
    if ((state.stats.missionsDone || 0) !== lastMissionsDone) persist();

    // Busted or story complete: save, then a fresh run starts from the title
    // — re-apply the save there, because a reset wipes cash and jobs done.
    if (state.screen !== previousScreen) {
      if (state.screen === 'busted' || state.screen === 'complete') persist();
      if (
        (previousScreen === 'busted' || previousScreen === 'complete')
        && state.screen === 'title'
      ) {
        const again = loadGame();
        if (again) applySave(state, again);
        lastMissionsDone = state.stats.missionsDone || 0;
      }
      previousScreen = state.screen;
    }

    game.draw(state.screen);
  }

  // The first gesture unlocks audio (browsers block sound before one).
  function unlockAudio() {
    audio.unlock();
  }
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  // Leaving the tab pauses a running game instead of letting the city run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') {
      state.screen = 'paused';
      persist();
    }
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
