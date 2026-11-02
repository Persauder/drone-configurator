import * as THREE from 'three';
import { initializeScene } from '/src/three/scene.ts';

const SMALL_FRAME_ID = 'frame-aster-450';
const SMALL_PATH = '/models/frames/aster-450/aster_450_quad.glb';
const BASE_PATH = '/models/frames/aster-450/aster_450_base.glb';
const GENERIC_PATH = '/models/quad_frame.glb';
const anchors = [
  'SmallQuad_MotorMount_01', 'SmallQuad_MotorMount_02',
  'SmallQuad_MotorMount_03', 'SmallQuad_MotorMount_04',
  'SmallQuad_CameraMount', 'SmallQuad_AntennaMount',
];
const check = (condition, message) => { if (!condition) throw new Error(message); };
const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const originalFetch = window.fetch;
const originalWarn = console.warn;
const originalError = console.error;
const warnings = [];
console.warn = (...args) => warnings.push(args);
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
const pathOf = (input) => new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
const requests = new Map();
window.fetch = (input, init) => {
  const path = pathOf(input);
  requests.set(path, (requests.get(path) ?? 0) + 1);
  return originalFetch(input, init);
};
const stage = (message) => { document.getElementById('smoke-result').textContent = `RUNNING: ${message}`; };
const select = (id, value) => {
  const control = document.getElementById(id);
  control.value = String(value);
  check(control.value === String(value), `${id}: requested option exists`);
  control.dispatchEvent(new Event('change', { bubbles: true }));
};
const onlyFrame = (viewer, model) => {
  check(model?.parent === viewer.scene, 'selected model is in the scene');
  check(viewer.scene.children.filter((child) => child.isGroup).length === 1, 'exactly one active frame');
};
const checkSmall = (model) => {
  check(model && anchors.every((name) => model.getObjectByName(name)), 'all six real Small Quad anchors found by getObjectByName');
  check(!model.getObjectByName('Quad_Body') && !model.getObjectByName('Hexa_Body')
    && !model.getObjectByName('Octo_Body'), 'standalone Small Quad contains no generic frames');
  check(model.scale.equals(new THREE.Vector3(1, 1, 1)), 'Small Quad preserves scale 1');
  for (let index = 1; index <= 4; index++) {
    const suffix = String(index).padStart(2, '0');
    check(model.getObjectByName(`SmallQuad_Arm_${suffix}`), 'quad layout includes four arms');
    check(model.getObjectByName(`SmallQuad_MotorHousing_${suffix}`), 'quad layout includes four motor housings');
  }
  model.traverse((part) => {
    check(!/(?:^|_)(?:Motor|Propeller|Camera|Antenna)(?:_|$)/i.test(part.name),
      `frame asset must not contain attached components: ${part.name}`);
  });
};
const checkBase = (model) => {
  check(model.getObjectByName('SmallQuad_TopPlate') && model.getObjectByName('SmallQuad_BottomPlate'), 'base contains central chassis');
  model.traverse((part) => {
    check(!/SmallQuad_(?:Arm_|MotorHousing_|MotorMount_)/.test(part.name), 'base contains no rotor layout');
  });
};

try {
  stage('Small Quad asset');
  const response = await originalFetch(SMALL_PATH);
  check(response.ok, 'Small Quad public URL is available');
  const bytes = await response.arrayBuffer();
  check(new DataView(bytes).getUint32(0, true) === 0x46546c67, 'Small Quad URL returns actual GLB, not HTML');

  stage('UI selection');
  const { droneView } = await import('/src/main.ts');
  const { configuration } = await import('/src/configurator/configuration.ts');
  const { frames } = await import('/src/data/frames.ts');
  check(frames.some((frame) => frame.id === SMALL_FRAME_ID), 'stable Small Frame ID exists in dataset');
  const initial = await droneView.modelReady;
  check(initial.getObjectByName('Quad_Body'), 'neutral preview remains generic Quad');
  const { scene, camera, renderer, controls } = droneView;
  const canvas = renderer.domElement;
  const persistentObjects = scene.children.filter((part) => part !== initial);
  select('frame', SMALL_FRAME_ID);
  check(configuration.rotorCount === 4 && document.getElementById('rotor-count').value === '4',
    'Aster 450 automatically selects its sole allowed layout');
  check(JSON.stringify([...document.getElementById('rotor-count').options].filter((item) => item.value !== '').map((item) => Number(item.value))) === '[4]',
    'Aster 450 exposes only rotor count 4');
  for (const invalid of [6, 8]) {
    const option = document.createElement('option');
    option.value = String(invalid);
    document.getElementById('rotor-count').append(option);
    select('rotor-count', invalid);
    check(configuration.rotorCount === 4 && document.getElementById('rotor-count').value === '4',
      `even an injected invalid ${invalid} option cannot persist in configuration or selection`);
    option.remove();
  }
  // A renamed UI label must never influence model mapping.
  document.getElementById('frame').selectedOptions[0].textContent = 'Renamed Small Frame';
  select('rotor-count', 4);
  const small = await droneView.modelReady;
  checkSmall(small);
  onlyFrame(droneView, small);
  check(initial.parent === null, 'Small Quad replaces previous generic frame');

  // Verify the finalized model contributes visible pixels under existing lighting.
  const target = new THREE.WebGLRenderTarget(256, 256);
  const background = scene.background;
  const grid = persistentObjects.find((part) => part.type === 'GridHelper');
  grid.visible = false;
  scene.background = new THREE.Color(0x000000);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(256 * 256 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
  check(pixels.some((value, index) => index % 4 !== 3 && value > 0), 'finalized Small Quad actually renders');
  renderer.setRenderTarget(null);
  target.dispose();
  scene.background = background;
  grid.visible = true;

  stage('unresolved Aster 450 base stage');
  const base = await droneView.setDroneFrame(undefined, SMALL_FRAME_ID);
  checkBase(base);
  onlyFrame(droneView, base);
  check(small.parent === null, 'base stage removes resolved quad');
  for (const invalid of [6, 8]) {
    const invalidModel = await droneView.setDroneFrame(invalid, SMALL_FRAME_ID);
    checkBase(invalidModel);
    onlyFrame(droneView, invalidModel);
    check(!invalidModel.getObjectByName('Hexa_Body') && !invalidModel.getObjectByName('Octo_Body'),
      'incompatible Aster layout cannot select generic Hexa or Octo');
  }
  select('rotor-count', 4);
  checkSmall(await droneView.modelReady);

  select('frame', 'frame-aster-960');
  const away = await droneView.modelReady;
  check(small.parent === null, 'changing frame alone removes Small Quad');
  check(away.getObjectByName('Quad_Body'), 'other frame uses generic neutral preview');
  for (const [count, name] of [[4, 'Quad'], [6, 'Hexa'], [8, 'Octo']]) {
    select('rotor-count', count);
    const model = await droneView.modelReady;
    check(model.getObjectByName(`${name}_Body`), `other Frame + ${count} uses generic ${name}`);
    onlyFrame(droneView, model);
  }
  select('frame', SMALL_FRAME_ID);
  select('rotor-count', 4);
  const restored = await droneView.modelReady;
  checkSmall(restored);
  onlyFrame(droneView, restored);
  check(restored !== small, 'cached template is cloned on return');
  check(persistentObjects.every((part) => part.parent === scene), 'grid and lights preserved');
  check(droneView.camera === camera && droneView.renderer === renderer && droneView.controls === controls
    && document.querySelector('#three-container canvas') === canvas, 'camera, renderer, canvas and controls reused');
  for (const path of [BASE_PATH, SMALL_PATH, GENERIC_PATH, '/models/hexa_frame.glb', '/models/octo_frame.glb']) {
    check(requests.get(path) === 1, `${path}: one network load per template`);
  }
  stage('Small 4 / other 4 / Small 4 async race');
  const raceContainer = document.createElement('div');
  raceContainer.style.cssText = 'width: 500px; height: 400px';
  document.body.append(raceContainer);
  const gates = new Map();
  const raceRequests = new Map();
  for (const path of [BASE_PATH, SMALL_PATH, GENERIC_PATH]) {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    gates.set(path, { promise, release });
  }
  window.fetch = (input, init) => {
    const path = pathOf(input);
    raceRequests.set(path, (raceRequests.get(path) ?? 0) + 1);
    const gate = gates.get(path);
    return gate ? gate.promise.then(() => originalFetch(input, init)) : originalFetch(input, init);
  };
  const race = initializeScene(raceContainer, 4, SMALL_FRAME_ID);
  const oldSmall = race.modelReady;
  const oldBase = race.setDroneFrame(undefined, SMALL_FRAME_ID);
  const oldGeneric = race.setDroneFrame(4, 'frame-aster-680');
  const latestSmall = race.setDroneFrame(4, SMALL_FRAME_ID);
  gates.get(SMALL_PATH).release();
  const latest = await latestSmall;
  checkSmall(latest);
  onlyFrame(race, latest);
  check(await oldSmall === undefined, 'older Small request ignored despite shared pending template');
  gates.get(BASE_PATH).release();
  check(await oldBase === undefined, 'base completing later cannot restore unresolved chassis over quad');
  gates.get(GENERIC_PATH).release();
  check(await oldGeneric === undefined, 'generic Quad completing later cannot overwrite latest Small Quad');
  onlyFrame(race, latest);
  check([BASE_PATH, SMALL_PATH, GENERIC_PATH].every((path) => raceRequests.get(path) === 1), 'in-flight cache uses distinct GLB paths');
  const generic = await race.setDroneFrame(4, 'frame-aster-680');
  check(generic.getObjectByName('Quad_Body') && latest.parent === null, 'stale generic template can be reused safely');
  const cachedSmall = await race.setDroneFrame(4, SMALL_FRAME_ID);
  checkSmall(cachedSmall);
  onlyFrame(race, cachedSmall);
  window.fetch = originalFetch;
  race.renderer.setAnimationLoop(null);
  race.controls.dispose();
  race.renderer.dispose();

  check(warnings.length === 0, `unexpected development warnings: ${warnings.map((args) => args.join(' ')).join('; ')}`);
  stage('missing anchor development warning');
  // Rename one node inside a test response without changing the GLB chunk sizes.
  const missingAnchor = 'SmallQuad_CameraMount';
  const alteredBytes = new Uint8Array(bytes.slice(0));
  const encodedAnchor = new TextEncoder().encode(missingAnchor);
  const jsonEnd = 20 + new DataView(bytes).getUint32(12, true);
  let renamed = false;
  for (let offset = 20; offset <= jsonEnd - encodedAnchor.length; offset++) {
    if (encodedAnchor.every((value, index) => alteredBytes[offset + index] === value)) {
      alteredBytes[offset + encodedAnchor.length - 1] = 'X'.charCodeAt(0);
      renamed = true;
      break;
    }
  }
  check(renamed, 'camera anchor exists in original asset JSON');
  window.fetch = (input, init) => pathOf(input) === SMALL_PATH
    ? Promise.resolve(new Response(alteredBytes, { headers: { 'Content-Type': 'model/gltf-binary' } }))
    : originalFetch(input, init);
  const warningContainer = document.createElement('div');
  warningContainer.style.cssText = 'width: 500px; height: 400px';
  document.body.append(warningContainer);
  const warningViewer = initializeScene(warningContainer, 4, SMALL_FRAME_ID);
  const incomplete = await warningViewer.modelReady;
  onlyFrame(warningViewer, incomplete);
  check(warnings.length === 1 && warnings[0][0].includes(SMALL_PATH)
    && warnings[0][0].includes(missingAnchor), 'missing anchor warning names asset and missing node');
  warningViewer.renderer.setAnimationLoop(null);
  warningViewer.controls.dispose();
  warningViewer.renderer.dispose();

  stage('Small Quad fallback and retry');
  window.fetch = (input, init) => pathOf(input) === SMALL_PATH
    ? Promise.reject(new Error('Simulated Small Quad load failure')) : originalFetch(input, init);
  const fallbackContainer = document.createElement('div');
  fallbackContainer.style.cssText = 'width: 500px; height: 400px';
  document.body.append(fallbackContainer);
  const fallbackViewer = initializeScene(fallbackContainer, 4, SMALL_FRAME_ID);
  const fallback = await fallbackViewer.modelReady;
  check(fallback.name === 'drone' && fallback.children.filter((part) => part.name.startsWith('motor-')).length === 4,
    'Small Quad load failure preserves four-rotor procedural fallback');
  onlyFrame(fallbackViewer, fallback);
  check(warnings.length === 2 && warnings[1][0].includes(SMALL_PATH), 'fallback warning identifies Small Quad asset');
  window.fetch = originalFetch;
  const recovered = await fallbackViewer.setDroneFrame(4, SMALL_FRAME_ID);
  checkSmall(recovered);
  onlyFrame(fallbackViewer, recovered);
  check(fallback.parent === null, 'successful retry removes procedural fallback');
  fallbackViewer.renderer.setAnimationLoop(null);
  fallbackViewer.controls.dispose();
  fallbackViewer.renderer.dispose();

  check(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  document.getElementById('smoke-result').textContent = 'PASS: Aster 450 only allows and auto-selects 4; injected 6/8 cannot remain selected; separate chassis base and resolved quad; all six anchors; no attached components; visible render; generic Quad/Hexa/Octo retained; one active frame; path caching; late base/generic/quad requests ignored; missing-anchor warning; procedural fallback and retry';
} catch (error) {
  document.getElementById('smoke-result').textContent = `FAIL: ${error.stack ?? error}; browser errors: ${errors.join('; ')}`;
} finally {
  window.fetch = originalFetch;
  console.warn = originalWarn;
  console.error = originalError;
}
