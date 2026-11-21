// Drawing only: the three.js scene for Solmar Bay. Static geometry (ground, roads,
// sea, pier, buildings, street props) is built once from the city; cars, pedestrians
// and the player are re-synced from state on every draw, so calling draw() twice in
// a row with the same state paints the same picture (screenshot staging paints twice).
// This is the only module that touches three.js — logic modules never see a Vector3.
import * as THREE from 'three';
import { CITY, COLORS } from './config.js';
import { buildingAt, generateCity } from './world.js';
import { createRandom } from './random.js';

const PED_COLORS = ['#e86a6a', '#6a9ae8', '#7fc8a9', '#e8c33d', '#c98bb0', '#e07b39', '#8fd0d0'];
const SKIN_COLORS = ['#f2c89b', '#c98d5f', '#8a5a3b', '#f7d7b0'];

/**
 * Build the renderer for a canvas. `city` is the generated city (from generateCity);
 * when omitted, a seed-1 city is built so a bare createRenderer(canvas) still paints.
 * Returns { draw(state, screen, view), resize(), setCameraMode(mode), setCity(city) }.
 * view = { mode:'title'|'chase'|'foot'|'top', target:{x,z}, heading }.
 */
export function createRenderer(canvas, city) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(0xa8c8dd, 220, 760);

  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1200);

  // Sun + sky fill.
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(140, 190, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340;
  sun.shadow.camera.bottom = -340;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));

  const materialCache = new Map();
  function material(color, opts) {
    const key = `${color}|${opts ? JSON.stringify(opts) : ''}`;
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshLambertMaterial({ color, ...(opts || {}) }));
    }
    return materialCache.get(key);
  }

  const staticGroup = new THREE.Group();
  scene.add(staticGroup);
  let activeCity = city || null;

  function buildStatic(cityData) {
    // Drop the previous static geometry (a rebuild only happens on setCity).
    while (staticGroup.children.length > 0) {
      const child = staticGroup.children[0];
      staticGroup.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }
    activeCity = cityData;
    const B = CITY.BOUND;

    // Ground slab for the whole town.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(B * 2 + 24, B * 2 + 24),
      material(COLORS.ground),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    staticGroup.add(ground);

    // Road strips, slightly above the ground so they never z-fight.
    for (const road of cityData.roads) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(road.axis === 'x' ? CITY.ROAD_W : B * 2 + 24, road.axis === 'x' ? B * 2 + 24 : CITY.ROAD_W),
        material(COLORS.road),
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(road.axis === 'x' ? road.at : 0, 0.02, road.axis === 'x' ? 0 : road.at);
      strip.receiveShadow = true;
      staticGroup.add(strip);
    }

    // Promenade: the sandy strip between the town edge and the water.
    const promenade = new THREE.Mesh(
      new THREE.PlaneGeometry(B * 2 + 24, 14),
      material(COLORS.sand),
    );
    promenade.rotation.x = -Math.PI / 2;
    promenade.position.set(0, 0.03, 270);
    promenade.receiveShadow = true;
    staticGroup.add(promenade);

    // Sea: a wide blue plane from the shoreline out to the horizon.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 500),
      material(COLORS.sea),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.01, CITY.SEA_Z + 250);
    staticGroup.add(sea);

    // Pier: wooden deck out into the water, on posts, with a striped beacon at the end.
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(46, 0.6, 38),
      material('#9a6b3f'),
    );
    deck.position.set(cityData.pier.x, 0.5, cityData.pier.z);
    deck.castShadow = true;
    deck.receiveShadow = true;
    staticGroup.add(deck);
    for (const px of [-21, 21]) {
      for (const pz of [cityData.pier.z - 17, cityData.pier.z + 17]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 3, 8),
          material('#6e4a26'),
        );
        post.position.set(cityData.pier.x + px, -0.6, pz);
        staticGroup.add(post);
      }
    }
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.1, 11, 12),
      material('#f2f5f7'),
    );
    beacon.position.set(cityData.pier.x + 16, 6.2, cityData.pier.z + 14);
    beacon.castShadow = true;
    staticGroup.add(beacon);
    const beaconTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 1.6, 12),
      material('#d94f3d'),
    );
    beaconTop.position.set(cityData.pier.x + 16, 12.4, cityData.pier.z + 14);
    staticGroup.add(beaconTop);

    // Buildings: one box each, varied heights and colours, with a flat roof slab.
    for (const b of cityData.buildings) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), material(b.color));
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      staticGroup.add(mesh);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.8, 0.5, b.d + 0.8),
        material('#3a3f46'),
      );
      roof.position.set(b.x, b.h + 0.25, b.z);
      roof.castShadow = true;
      staticGroup.add(roof);
    }

    // Street props.
    for (const prop of cityData.props) {
      if (prop.type === 'lamp') {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8),
          material('#2e3238'),
        );
        pole.position.y = 2.3;
        pole.castShadow = true;
        group.add(pole);
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.22, 0.3),
          material('#ffe9a8', { emissive: '#ffdf6b', emissiveIntensity: 0.7 }),
        );
        head.position.y = 4.6;
        group.add(head);
        group.position.set(prop.x, 0, prop.z);
        group.rotation.y = prop.ry;
        staticGroup.add(group);
      } else if (prop.type === 'palm') {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.3, 5, 8),
          material('#8a6a44'),
        );
        trunk.position.y = 2.5;
        trunk.castShadow = true;
        group.add(trunk);
        const crown = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.9, 0),
          material('#3f9e57'),
        );
        crown.position.y = 5.6;
        crown.scale.y = 0.6;
        crown.castShadow = true;
        group.add(crown);
        group.position.set(prop.x, 0, prop.z);
        group.rotation.y = prop.ry;
        staticGroup.add(group);
      } else if (prop.type === 'hydrant') {
        const hydrant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.34, 0.9, 10),
          material('#d9382b'),
        );
        hydrant.position.set(prop.x, 0.45, prop.z);
        hydrant.castShadow = true;
        staticGroup.add(hydrant);
      } else if (prop.type === 'bench') {
        const group = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.6), material('#9a6b3f'));
        seat.position.y = 0.5;
        seat.castShadow = true;
        group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.12), material('#9a6b3f'));
        back.position.set(0, 0.95, -0.26);
        group.add(back);
        group.position.set(prop.x, 0, prop.z);
        group.rotation.y = prop.ry;
        staticGroup.add(group);
      }
    }
  }

  buildStatic(city || generateCity(createRandom(1)));

  // ---- Dynamic meshes, synced from state every draw ----
  const dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);
  const carMeshes = new Map();
  const pedMeshes = new Map();

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = material('#14161a');
  const glassMat = material('#1d2b38');

  function makeCarMesh(car) {
    const group = new THREE.Group();
    const isTruck = car.kind === 'truck';
    const isSport = car.kind === 'sport';
    const bodyLen = isTruck ? 6.2 : 4.4;
    const bodyH = isSport ? 0.7 : 0.95;
    const bodyColor = typeof car.color === 'number'
      ? `#${car.color.toString(16).padStart(6, '0')}`
      : car.color;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, bodyH, bodyLen),
      material(bodyColor),
    );
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);
    if (isTruck) {
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, 3), material('#c9cdd2'));
      cargo.position.set(0, 1.5, -1.1);
      cargo.castShadow = true;
      group.add(cargo);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.1), glassMat);
      cabin.position.set(0, 1.35, isSport ? 0.1 : -0.2);
      cabin.castShadow = true;
      group.add(cabin);
    }
    if (car.kind === 'taxi') {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.25, 0.4),
        material('#ffe9a8', { emissive: '#ffdf6b', emissiveIntensity: 0.5 }),
      );
      sign.position.set(0, 1.8, -0.2);
      group.add(sign);
    }
    if (car.kind === 'police') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), material('#20242a'));
      bar.position.set(0, 1.75, -0.2);
      group.add(bar);
      const red = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.24, 0.52),
        material('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 0.9 }),
      );
      red.position.set(-0.32, 1.75, -0.2);
      group.add(red);
      const blue = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.24, 0.52),
        material('#2a5aff', { emissive: '#2a5aff', emissiveIntensity: 0.9 }),
      );
      blue.position.set(0.32, 1.75, -0.2);
      group.add(blue);
    }
    for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz * (isTruck ? 1.35 : 1));
      group.add(wheel);
    }
    return group;
  }

  function makePedMesh(ped) {
    const group = new THREE.Group();
    const shirt = PED_COLORS[Math.abs(ped.id) % PED_COLORS.length];
    const skin = SKIN_COLORS[Math.abs(ped.id * 7 + 3) % SKIN_COLORS.length];
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.36), material(shirt));
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), material(skin));
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.3), material('#2e3238'));
    legs.position.y = 0.25;
    group.add(legs);
    return group;
  }

  // The player: bright jacket, easy to spot in a crowd.
  const playerMesh = new THREE.Group();
  const playerBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.4), material(COLORS.player));
  playerBody.position.y = 0.95;
  playerBody.castShadow = true;
  playerMesh.add(playerBody);
  const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), material('#f2c89b'));
  playerHead.position.y = 1.68;
  playerHead.castShadow = true;
  playerMesh.add(playerHead);
  const playerLegs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.32), material('#2b4acb'));
  playerLegs.position.y = 0.25;
  playerMesh.add(playerLegs);
  dynamicGroup.add(playerMesh);

  // Mission marker: a gold beacon at the active target.
  const marker = new THREE.Group();
  const beaconMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 7, 16, 1, true),
    new THREE.MeshLambertMaterial({ color: '#ffcf3f', transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  beaconMesh.position.y = 3.5;
  marker.add(beaconMesh);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 2.0, 24),
    new THREE.MeshLambertMaterial({ color: '#ffcf3f', transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  marker.add(ring);
  marker.visible = false;
  dynamicGroup.add(marker);

  function syncDynamic(state) {
    // Cars: create meshes for new ids, drop meshes for cars that left, move the rest.
    const seenCars = new Set();
    for (const car of state.cars) {
      seenCars.add(car.id);
      let mesh = carMeshes.get(car.id);
      if (!mesh) {
        mesh = makeCarMesh(car);
        carMeshes.set(car.id, mesh);
        dynamicGroup.add(mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
    }
    for (const [id, mesh] of carMeshes) {
      if (!seenCars.has(id)) {
        dynamicGroup.remove(mesh);
        carMeshes.delete(id);
      }
    }
    // Pedestrians, same treatment.
    const seenPeds = new Set();
    for (const ped of state.peds) {
      seenPeds.add(ped.id);
      let mesh = pedMeshes.get(ped.id);
      if (!mesh) {
        mesh = makePedMesh(ped);
        pedMeshes.set(ped.id, mesh);
        dynamicGroup.add(mesh);
      }
      mesh.position.set(ped.x, 0, ped.z);
      mesh.rotation.y = ped.heading;
    }
    for (const [id, mesh] of pedMeshes) {
      if (!seenPeds.has(id)) {
        dynamicGroup.remove(mesh);
        pedMeshes.delete(id);
      }
    }
    // Player: hidden while driving (they are inside the car).
    const p = state.player;
    playerMesh.visible = p.onFoot;
    if (p.onFoot) {
      playerMesh.position.set(p.x, 0, p.z);
      playerMesh.rotation.y = p.heading;
    }
    // Mission beacon.
    const m = state.mission;
    if (m && m.state === 'active' && m.target) {
      marker.visible = true;
      marker.position.set(m.target.x, 0, m.target.z);
      marker.rotation.y = state.time * 0.8;
    } else {
      marker.visible = false;
    }
  }

  let cameraMode = 'chase';

  function placeCamera(view, state) {
    const mode = (view && view.mode) || cameraMode;
    const target = (view && view.target) || { x: state.player.x, z: state.player.z };
    const heading = (view && typeof view.heading === 'number' ? view.heading : state.player.heading) || 0;
    if (mode === 'title') {
      const a = state.time * 0.045;
      camera.position.set(Math.sin(a) * 250, 95, 40 + Math.cos(a) * 250);
      camera.lookAt(0, 8, 60);
      return;
    }
    if (mode === 'top') {
      camera.position.set(target.x, 170, target.z + 0.01);
      camera.lookAt(target.x, 0, target.z);
      return;
    }
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    // Chase framing is close and low on purpose: the player car fills a good
    // part of the frame, and a police car pulling up alongside or ramming from
    // behind is in shot instead of lost in the distance. 'pursuit' (the chase
    // screenshot) pulls back just enough to keep the trailing police car
    // between the camera and the player car.
    const dist = mode === 'foot' ? 8.5 : mode === 'pursuit' ? 12 : 9;
    let height = mode === 'foot' ? 4.6 : mode === 'pursuit' ? 9 : 5;
    const lookAhead = mode === 'foot' ? 6 : 7;
    let camX = target.x - fx * dist;
    let camZ = target.z - fz * dist;
    // Never sit inside a building: lift the camera above any roof it would
    // otherwise clip through (chase cam behind a car hugging a tall block).
    if (activeCity) {
      const under = buildingAt(activeCity, camX, camZ, 1);
      if (under) height = Math.max(height, under.h + 4);
    }
    camera.position.set(camX, height, camZ);
    camera.lookAt(target.x + fx * lookAhead, 1.4, target.z + fz * lookAhead);
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth || 1280;
    const height = canvas.clientHeight || window.innerHeight || 720;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(width, height, false);
      canvas.width = w;
      canvas.height = h;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /** Paint one frame from state. Safe to call twice in a row with the same state. */
  function draw(state, screen, view) {
    resize();
    syncDynamic(state);
    placeCamera(view, state);
    renderer.render(scene, camera);
  }

  function setCameraMode(mode) {
    cameraMode = mode;
  }

  function setCity(cityData) {
    buildStatic(cityData);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, setCameraMode, setCity };
}
