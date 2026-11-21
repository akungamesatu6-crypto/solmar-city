// Save / load for Harbor Heat. Everything is wrapped in try/catch: private
// windows and disabled storage must never break the game.
import { BEST_KEY, SAVE_KEY } from './config.js';

// Read one JSON value from localStorage, or null when it is missing or broken.
function readStored(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Write one JSON value to localStorage; false when storage refuses.
function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Persist the parts of a run worth keeping: cash, jobs done, the current
// mission, and the best stats so far. Returns true when the save landed.
export function saveGame(state) {
  const data = {
    cash: state.player.cash || 0,
    missionsDone: state.stats.missionsDone || 0,
    missionIndex: state.mission && state.mission.state === 'active' ? state.mission.index : -1,
    best: {
      missionsDone: state.stats.missionsDone || 0,
      cash: state.player.cash || 0,
      distance: Math.floor(state.stats.distance || 0),
      carsStolen: state.stats.carsStolen || 0,
      shotsFired: state.stats.shotsFired || 0,
    },
    savedAt: Date.now(),
  };
  const ok = writeStored(SAVE_KEY, data);
  if (!ok) return false;
  // Best stats live under their own key too, so the title screen can show
  // them without loading a whole save. Only a run that is at least as good
  // as the old best replaces it.
  const previousBest = loadBest();
  if (!previousBest
    || (data.best.missionsDone >= (previousBest.missionsDone || 0)
      && data.best.cash >= (previousBest.cash || 0))) {
    writeStored(BEST_KEY, data.best);
  }
  return true;
}

// The best stats ever saved, or null when there is no best yet.
export function loadBest() {
  const data = readStored(BEST_KEY);
  return data && typeof data === 'object' ? data : null;
}

// The saved object, or null when there is no save (or it is unreadable).
export function loadGame() {
  const data = readStored(SAVE_KEY);
  if (!data || typeof data !== 'object') return null;
  return {
    cash: typeof data.cash === 'number' ? data.cash : 0,
    missionsDone: typeof data.missionsDone === 'number' ? data.missionsDone : 0,
    missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : -1,
    best: data.best && typeof data.best === 'object' ? data.best : null,
    savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
  };
}

// Apply a loaded save to a fresh state (cash, jobs done, best stats).
export function applySave(state, save) {
  if (!save) return;
  state.player.cash = save.cash;
  state.stats.missionsDone = save.missionsDone;
  if (save.best) {
    state.stats.best = save.best;
  }
}

// Forget the save and the best stats. Returns true when storage cooperated.
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
    window.localStorage.removeItem(BEST_KEY);
    return true;
  } catch {
    return false;
  }
}
