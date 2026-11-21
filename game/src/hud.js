// HUD for Harbor Heat — the DOM overlay in #hud plus the #minimap canvas.
//
// update() reads the live state on every call, so the overlay never goes
// stale; drawMinimap() paints the streets, the sea, the cars, the police and
// the mission marker from above. System fonts only, no images.
import { CITY } from './config.js';

const MINIMAP_SIZE = 180;
// The minimap covers the whole city plus the pier: x in [-264, 264], z in [-264, 300].
const MAP_MIN_X = -264;
const MAP_MIN_Z = -264;
const MAP_SPAN_X = 528;
const MAP_SPAN_Z = 564;
// The road grid, used when no city object is handed to drawMinimap.
const ROAD_LINES = [-252, -180, -108, -36, 36, 108, 180, 252];

// World coordinates -> minimap pixels. North (low z) is up.
function toMap(x, z) {
  return {
    x: ((x - MAP_MIN_X) / MAP_SPAN_X) * MINIMAP_SIZE,
    y: ((z - MAP_MIN_Z) / MAP_SPAN_Z) * MINIMAP_SIZE,
  };
}

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The player's speed in km/h — the car's speed while driving, on-foot speed
// while walking.
function speedKmh(state) {
  let speed = state.player.speed || 0;
  if (!state.player.onFoot && state.player.carId !== null && state.player.carId !== undefined) {
    const car = state.cars.find((c) => c.id === state.player.carId);
    if (car) speed = car.speed || 0;
  }
  return Math.round(Math.abs(speed) * 3.6);
}

function formatClock(secondsLeft) {
  const left = Math.max(0, Math.ceil(secondsLeft || 0));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

export function createHud() {
  // Reuse the overlay index.html already provides, or build one.
  let hudRoot = document.getElementById('hud');
  if (!hudRoot) {
    hudRoot = makeEl('div');
    hudRoot.id = 'hud';
    document.body.appendChild(hudRoot);
  }
  hudRoot.textContent = '';

  // Top left: health bar over the cash readout.
  const topLeft = makeEl('div', 'hud-top-left');
  const healthWrap = makeEl('div', 'hud-health');
  const healthFill = makeEl('div', 'hud-health-fill');
  healthWrap.appendChild(healthFill);
  const cash = makeEl('div', 'hud-cash', '$0');
  topLeft.appendChild(healthWrap);
  topLeft.appendChild(cash);

  // Top right: wanted stars.
  const wanted = makeEl('div', 'hud-wanted', '');
  wanted.setAttribute('aria-label', 'Wanted level');

  // Bottom left: speed, objective line, and the mission timer.
  const bottomLeft = makeEl('div', 'hud-bottom-left');
  const speed = makeEl('div', 'hud-speed', '0 km/h');
  const objective = makeEl('div', 'hud-objective', '');
  const timer = makeEl('div', 'hud-timer', '');
  bottomLeft.appendChild(speed);
  bottomLeft.appendChild(objective);
  bottomLeft.appendChild(timer);

  // The minimap canvas: reuse index.html's, or build one at 180x180.
  let minimap = document.getElementById('minimap');
  if (!minimap || minimap.tagName !== 'CANVAS') {
    minimap = document.createElement('canvas');
    minimap.id = 'minimap';
  }
  minimap.width = MINIMAP_SIZE;
  minimap.height = MINIMAP_SIZE;
  const minimapWrap = makeEl('div', 'hud-minimap');
  minimapWrap.appendChild(minimap);

  // A full-width banner for the busted / story-complete screens.
  const banner = makeEl('div', 'hud-banner', '');
  banner.style.display = 'none';

  // The title screen: name, tagline, start hint, controls.
  const title = makeEl('div', 'hud-title');
  title.appendChild(makeEl('h1', null, 'HARBOR HEAT'));
  title.appendChild(makeEl('div', 'hud-subtitle', 'Solmar Bay — a Harbor Crew story'));
  title.appendChild(makeEl('div', 'hud-start', 'Press Space or click to start'));
  title.appendChild(makeEl('div', 'hud-controls',
    'WASD — walk / drive   ·   F — enter or steal a car   ·   E — punch   ·   Space / click — shoot   ·   P — pause'));
  title.style.display = 'none';

  hudRoot.appendChild(topLeft);
  hudRoot.appendChild(wanted);
  hudRoot.appendChild(bottomLeft);
  hudRoot.appendChild(minimapWrap);
  hudRoot.appendChild(banner);
  hudRoot.appendChild(title);

  // Only touch the DOM when the text actually changed.
  let lastObjective = null;
  let lastTimerText = null;

  function update(state, screen) {
    const health = Math.max(0, Math.min(100, state.player.health === undefined ? 100 : state.player.health));
    healthFill.style.width = `${health}%`;
    healthFill.style.background = health > 50 ? '#37d67a' : health > 25 ? '#f5a623' : '#e5484d';
    cash.textContent = `$${Math.floor(state.player.cash || 0).toLocaleString('en-US')}`;

    const stars = Math.max(0, Math.min(5, state.player.wanted || 0));
    wanted.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    wanted.style.color = stars === 0 ? 'rgba(255,255,255,0.55)' : '#ffd21f';
    wanted.style.display = screen === 'play' ? '' : 'none';

    speed.textContent = `${speedKmh(state)} km/h`;
    speed.style.display = screen === 'play' ? '' : 'none';

    title.style.display = screen === 'title' ? '' : 'none';

    const mission = state.mission;
    let objectiveText = '';
    if (mission && mission.state === 'active') {
      objectiveText = mission.title ? `${mission.title} — ${mission.text}` : mission.text;
    } else if (mission && (mission.state === 'done' || mission.state === 'failed')) {
      objectiveText = mission.text || '';
    } else if (screen === 'play') {
      objectiveText = 'Find the crew garage to start a job. Press F near a car to get in.';
    }
    if (objectiveText !== lastObjective) {
      objective.textContent = objectiveText;
      lastObjective = objectiveText;
    }

    let timerText = '';
    if (mission && mission.state === 'active' && mission.timer > 0) {
      timerText = `⏱ ${formatClock(mission.timeLeft)}`;
    }
    if (timerText !== lastTimerText) {
      timer.textContent = timerText;
      lastTimerText = timerText;
    }

    if (screen === 'busted') {
      banner.textContent = 'BUSTED — the police caught you. Press Space to try again.';
      banner.style.display = '';
    } else if (screen === 'complete') {
      banner.textContent = 'THE BIG SCORE — all five Harbor Crew jobs done. Solmar Bay is yours.';
      banner.style.display = '';
    } else {
      banner.style.display = 'none';
    }
  }

  function drawStreets(ctx, city) {
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = 3;
    const roads = (city && city.roads) || [];
    const drawLine = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    if (roads.length > 0) {
      for (const road of roads) {
        if (road.axis === 'x') {
          const a = toMap(MAP_MIN_X, road.at);
          const b = toMap(MAP_MIN_X + MAP_SPAN_X, road.at);
          drawLine(a.x, a.y, b.x, b.y);
        } else {
          const a = toMap(road.at, MAP_MIN_Z);
          const b = toMap(road.at, MAP_MIN_Z + MAP_SPAN_Z);
          drawLine(a.x, a.y, b.x, b.y);
        }
      }
      return;
    }
    for (const at of ROAD_LINES) {
      const h1 = toMap(MAP_MIN_X, at);
      const h2 = toMap(MAP_MIN_X + MAP_SPAN_X, at);
      drawLine(h1.x, h1.y, h2.x, h2.y);
      const v1 = toMap(at, MAP_MIN_Z);
      const v2 = toMap(at, MAP_MIN_Z + MAP_SPAN_Z);
      drawLine(v1.x, v1.y, v2.x, v2.y);
    }
  }

  function drawMinimap(state, city) {
    const ctx = minimap.getContext('2d');
    if (!ctx) return;
    const S = MINIMAP_SIZE;

    // Ground.
    ctx.fillStyle = '#1d2b1f';
    ctx.fillRect(0, 0, S, S);

    // Sea: everything past the promenade.
    const seaTop = toMap(0, CITY.SEA_Z).y;
    ctx.fillStyle = '#1f6f8b';
    ctx.fillRect(0, seaTop, S, S - seaTop);
    // The promenade strip between town and water.
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, toMap(0, 264).y, S, Math.max(1, seaTop - toMap(0, 264).y));

    drawStreets(ctx, city);

    // Mission marker: a pulsing yellow diamond.
    const mission = state.mission;
    if (mission && mission.state === 'active' && mission.target) {
      const p = toMap(mission.target.x, mission.target.z);
      const pulse = 5 + 2 * Math.sin((state.time || 0) * 4);
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - pulse);
      ctx.lineTo(p.x + pulse, p.y);
      ctx.lineTo(p.x, p.y + pulse);
      ctx.lineTo(p.x - pulse, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Cars: white dots for traffic, blue for police.
    for (const car of state.cars) {
      const p = toMap(car.x, car.z);
      const isPolice = car.driver === 'police' || car.kind === 'police';
      ctx.fillStyle = isPolice ? '#3aa0ff' : '#f2f2f2';
      ctx.beginPath();
      ctx.arc(p.x, p.y, isPolice ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow, pointing along the heading (heading 0 faces +Z, down the map).
    const pp = toMap(state.player.x, state.player.z);
    const heading = state.player.heading || 0;
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffd21f';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return { update, drawMinimap };
}
