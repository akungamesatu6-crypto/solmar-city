// Keyboard and pointer input. Held keys give a steering direction; one-shot presses
// (start, pause, enter a car, punch, shoot) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice.
//
// Two queues, because two consumers read presses: main.js owns the screen actions
// (CONFIRM, PAUSE) and game.js owns the gameplay actions (ENTER, PUNCH, SHOOT).
// takeActions() drains only the screen queue and takeGameActions() only the gameplay
// queue, so neither consumer can eat the other's presses. Space / click raise both
// CONFIRM (start on the title screen) and SHOOT (fire while playing).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyF']);
const PUNCH = new Set(['KeyE']);
// Space and a mouse click both fire the pistol while playing; on the title screen
// the same press confirms, so Space also raises ACTION_CONFIRM.

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let gameActions = 0;

  function onKeyDown(event) {
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
      return;
    }
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) {
        actions |= ACTION_CONFIRM;
        gameActions |= ACTION_SHOOT;
      }
      event.preventDefault();
      return;
    }
    if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
      return;
    }
    if (ENTER_CAR.has(event.code)) {
      if (!event.repeat) gameActions |= ACTION_ENTER;
      event.preventDefault();
      return;
    }
    if (PUNCH.has(event.code)) {
      if (!event.repeat) gameActions |= ACTION_PUNCH;
      event.preventDefault();
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      keys.add(event.code);
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onBlur() {
    // A key released while the tab is hidden never sends keyup: let go of everything.
    keys.clear();
  }

  function onPointerDown() {
    actions |= ACTION_CONFIRM;
    gameActions |= ACTION_SHOOT;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  if (canvas) canvas.addEventListener('pointerdown', onPointerDown);

  return {
    /** The set of currently held key codes (KeyW, ShiftLeft, ...). */
    keys,
    /** -1 for left, 1 for right, 0 for neither or both. */
    moveX() {
      const left = keys.has('KeyA') || keys.has('ArrowLeft');
      const right = keys.has('KeyD') || keys.has('ArrowRight');
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** 1 for forward (W), -1 for back (S), 0 for neither or both. */
    moveY() {
      const forward = keys.has('KeyW') || keys.has('ArrowUp');
      const back = keys.has('KeyS') || keys.has('ArrowDown');
      return (forward ? 1 : 0) - (back ? 1 : 0);
    },
    /** The one-shot screen presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The one-shot gameplay presses since the last call, as ACTION_* flags. */
    takeGameActions() {
      const taken = gameActions;
      gameActions = 0;
      return taken;
    },
    /** Forget every held key and queued action (used on reset). */
    clear() {
      keys.clear();
      actions = 0;
      gameActions = 0;
    },
  };
}
