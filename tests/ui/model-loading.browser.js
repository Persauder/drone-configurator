const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const originalError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
const check = (condition, message) => { if (!condition) throw new Error(message); };

try {
  const stage = (message) => { document.getElementById('smoke-result').textContent = `RUNNING: ${message}`; };
  stage('HTTP fetch');
  const response = await fetch('/models/quad_frame.glb');
  check(response.ok, 'public GLB returns HTTP 200');
  const bytes = await response.arrayBuffer();
  check(new DataView(bytes).getUint32(0, true) === 0x46546c67, 'response is a GLB, not the Vite HTML fallback');

  const container = document.getElementById('three-container');
  const originalFetch = window.fetch;
  const requests = new Map();
  const requestPath = (input) => new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
  window.fetch = (input, init) => {
    const path = requestPath(input);
    requests.set(path, (requests.get(path) ?? 0) + 1);
    return originalFetch(input, init);
  };
  const viewer = initializeScene(container);
  const { scene, camera, renderer, controls, modelReady } = viewer;
  check(!scene.getObjectByName('drone'), 'procedural model is absent while loading');
  stage('model load');
  const model = await modelReady;
  check(model.isGroup && model.parent === scene, 'loaded GLB group is in the scene');
  check(model.getObjectByName('Quad_Body'), 'real Blender Quad loaded');
  check(!scene.getObjectByName('drone'), 'procedural fallback is absent after success');
  check(scene.children.filter((child) => child.isGroup).length === 1, 'exactly one drone model');
  check(model.scale.equals(new THREE.Vector3(1, 1, 1)), 'metric root scale is 1');
  let meshCount = 0;
  model.traverse((part) => {
    if (!part.isMesh) return;
    meshCount++;
    check(part.material.isMeshStandardMaterial, 'GLTF standard material preserved');
    check(part.castShadow && part.receiveShadow, 'GLB mesh shadows enabled');
  });
  check(meshCount === 9, 'all nine Blender frame meshes loaded');
  let bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  check(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6, 'frame centered near origin');
  const grid = scene.children.find((part) => part.type === 'GridHelper');
  check(bounds.min.y > grid.position.y, 'frame clears the grid');
  function checkFraming() {
    camera.updateMatrixWorld();
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          check(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1
            && Math.abs(projected.z) < 1, 'entire frame lies inside camera frustum');
        }
      }
    }
  }
  checkFraming();

  // Render the real model alone into a target and verify it contributes pixels.
  const target = new THREE.WebGLRenderTarget(256, 256);
  const background = scene.background;
  grid.visible = false;
  scene.background = new THREE.Color(0x000000);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(256 * 256 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
  check(pixels.some((value, index) => index % 4 !== 3 && value > 0), 'Blender geometry actually renders with existing lighting');
  renderer.setRenderTarget(null);
  target.dispose();
  scene.background = background;
  grid.visible = true;

  stage('frame switching and cache');
  const persistentObjects = scene.children.filter((part) => part !== model);
  const names = { 4: 'Quad', 6: 'Hexa', 8: 'Octo' };
  let previousModel = model;
  for (const count of [4, 6, 8, 4, undefined]) {
    const nextModel = await viewer.setDroneFrame(count);
    check(nextModel.getObjectByName(`${names[count ?? 4]}_Body`), `${count}: correct Blender frame`);
    check(scene.children.filter((part) => part.isGroup).length === 1, 'switching retains exactly one frame');
    if (previousModel !== nextModel) check(previousModel.parent === null, 'old frame removed');
    check(nextModel.scale.equals(new THREE.Vector3(1, 1, 1)), 'switching preserves metric scale');
    check(persistentObjects.every((part) => part.parent === scene), 'grid and lights survive switching');
    check(viewer.camera === camera && viewer.renderer === renderer && viewer.controls === controls,
      'switching reuses camera, renderer and controls');
    bounds = new THREE.Box3().setFromObject(nextModel);
    check(bounds.min.y > grid.position.y, 'switched model clears grid');
    checkFraming();
    previousModel = nextModel;
  }
  for (const name of ['quad', 'hexa', 'octo']) {
    check(requests.get(`/models/${name}_frame.glb`) === 1, `${name}: only one network load`);
  }
  window.fetch = originalFetch;

  stage('controls');
  const beforeOrbit = camera.position.clone();
  const canvas = renderer.domElement;
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
  controls.update();
  check(camera.position.distanceTo(beforeOrbit) > 0.001, 'OrbitControls wheel changes camera');
  // Check the controls keyboard input as well as wheel zoom.
  controls.listenToKeyEvents(window);
  const beforePan = controls.target.clone();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true }));
  controls.update();
  check(controls.target.distanceTo(beforePan) > 0, 'OrbitControls keyboard pan works');
  const beforeRotation = camera.position.clone();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true }));
  controls.update();
  check(camera.position.distanceTo(beforeRotation) > 0.001, 'OrbitControls rotation works');
  controls.stopListenToKeyEvents();

  stage('resize');
  container.style.width = '300px';
  container.style.height = '700px';
  container.getBoundingClientRect();
  for (let attempt = 0; attempt < 20 && Math.abs(camera.aspect - 300 / 700) > 1e-6; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(Math.abs(camera.aspect - 300 / 700) < 1e-6, 'ResizeObserver updates camera aspect');
  check(renderer.getSize(new THREE.Vector2()).equals(new THREE.Vector2(300, 700)), 'renderer resizes');
  checkFraming();
  renderer.setAnimationLoop(null);
  controls.dispose();
  renderer.dispose();

  stage('fallback');
  stage('out-of-order async loads');
  const raceContainer = document.createElement('div');
  raceContainer.style.cssText = 'width: 500px; height: 400px';
  document.body.append(raceContainer);
  const gates = new Map();
  const raceRequests = new Map();
  const originalRaceWarn = console.warn;
  const raceWarnings = [];
  console.warn = (...args) => raceWarnings.push(args);
  for (const name of ['quad', 'hexa', 'octo']) {
    let release;
    let reject;
    const promise = new Promise((resolve, rejectLoad) => { release = resolve; reject = rejectLoad; });
    gates.set(`/models/${name}_frame.glb`, { promise, release, reject });
  }
  window.fetch = (input, init) => {
    const path = requestPath(input);
    raceRequests.set(path, (raceRequests.get(path) ?? 0) + 1);
    return gates.get(path).promise.then(() => originalFetch(input, init));
  };
  try {
    const race = initializeScene(raceContainer);
    const quadRequest = race.modelReady;
    const hexaRequest = race.setDroneFrame(6);
    const oldOctoRequest = race.setDroneFrame(8);
    const repeatedHexa = race.setDroneFrame(6);
    const latestOcto = race.setDroneFrame(8);
    gates.get('/models/octo_frame.glb').release();
    const octo = await latestOcto;
    check(octo.getObjectByName('Octo_Body'), 'latest Octo selection wins');
    check(await oldOctoRequest === undefined, 'earlier selection of same pending template is ignored');
    gates.get('/models/hexa_frame.glb').reject(new Error('Simulated stale Hexa failure'));
    check(await hexaRequest === undefined && await repeatedHexa === undefined, 'late Hexa failures ignored');
    gates.get('/models/quad_frame.glb').release();
    check(await quadRequest === undefined, 'late initial Quad ignored');
    check(octo.parent === race.scene && race.scene.children.filter((part) => part.isGroup).length === 1,
      'late loads never replace latest frame or accumulate models');
    check(raceWarnings.length === 0, 'stale failure never logs current-selection fallback warning');
    for (const count of raceRequests.values()) check(count === 1, 'pending template requests are cached');
    check((await race.setDroneFrame(4)).getObjectByName('Quad_Body'), 'stale successful template remains reusable');
    window.fetch = originalFetch;
    check((await race.setDroneFrame(6)).getObjectByName('Hexa_Body'), 'stale failed load also evicts the cache for retry');
    race.renderer.setAnimationLoop(null);
    race.controls.dispose();
    race.renderer.dispose();
  } finally {
    window.fetch = originalFetch;
    console.warn = originalRaceWarn;
  }

  stage('fallback');
  const originalWarn = console.warn;
  const warnings = [];
  window.fetch = async () => { throw new Error('Simulated unavailable GLB'); };
  console.warn = (...args) => warnings.push(args);
  try {
    let failure;
    try { await loadDroneModel('/missing-drone.glb'); } catch (error) { failure = error; }
    check(failure?.message.includes('/missing-drone.glb') && failure.cause, 'loader rejects with path and original cause');
    const fallbackContainer = document.createElement('div');
    fallbackContainer.style.cssText = 'width: 500px; height: 400px';
    document.body.append(fallbackContainer);
    const fallbackScene = initializeScene(fallbackContainer, 6);
    const fallback = await fallbackScene.modelReady;
    check(fallback.name === 'drone' && fallback.parent === fallbackScene.scene, 'load failure displays procedural frame');
    check(fallback.children.filter((part) => part.name.startsWith('motor-')).length === 6, 'Hexa failure uses six-rotor fallback');
    check(fallbackScene.scene.children.filter((child) => child.isGroup).length === 1, 'fallback never coexists with GLB');
    check(warnings.length === 1, 'failure is reported once');
    check(warnings[0][0].includes('/models/hexa_frame.glb'), 'error identifies the failing GLB');
    window.fetch = originalFetch;
    const recovered = await fallbackScene.setDroneFrame(6);
    check(recovered.getObjectByName('Hexa_Body'), 'failed cache entry is evicted and same selection can retry');
    check(fallback.parent === null && !fallbackScene.scene.getObjectByName('drone'), 'recovery removes fallback');
    fallbackScene.renderer.setAnimationLoop(null);
    fallbackScene.controls.dispose();
    fallbackScene.renderer.dispose();
  } finally {
    window.fetch = originalFetch;
    console.warn = originalWarn;
  }
  check(errors.length === 0, `browser console/runtime errors: ${errors.join('; ')}`);
  document.getElementById('smoke-result').textContent = 'PASS: real GLB loading/rendering; 4 → 6 → 8 → 4 and undefined preview; one frame; cached network and pending loads; out-of-order async safety; scale 1; preserved lights/grid/renderer/camera/controls; OrbitControls and resize; six-rotor fallback and retry recovery; no console errors';
} catch (error) {
  document.getElementById('smoke-result').textContent = `FAIL: ${error.stack ?? error}; browser errors: ${errors.join('; ')}`;
} finally {
  console.error = originalError;
}
import * as THREE from 'three';
import { initializeScene } from '/src/three/scene.ts';
import { loadDroneModel } from '/src/three/modelLoader.ts';

