import * as THREE from 'three';

const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const originalError = console.error;
const originalWarn = console.warn;
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
console.warn = (...args) => { errors.push(args.join(' ')); originalWarn(...args); };
const check = (value, message) => { if (!value) throw new Error(message); };
const stage = (message) => { document.querySelector('#smoke-result').textContent = `RUNNING: ${message}`; };
const select = (id, value) => {
  const control = document.getElementById(id);
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
};
const near = (a, b, tolerance = 1e-5) => Math.abs(a - b) < tolerance;
const motorRoots = (frame) => Array.from({ length: 4 }, (_, index) =>
  frame.getObjectByName(`SmallQuad_Motor_${String(index + 1).padStart(2, '0')}`));
const mountNodes = (frame) => Array.from({ length: 4 }, (_, index) =>
  frame.getObjectByName(`SmallQuad_MotorMount_${String(index + 1).padStart(2, '0')}`));
const armNodes = (frame) => Array.from({ length: 4 }, (_, index) =>
  frame.getObjectByName(`SmallQuad_Arm${String(index + 1).padStart(2, '0')}_Assembly`));
const noMotors = (frame) => motorRoots(frame).every((root) => !root)
  && mountNodes(frame).every((mount) => mount.children.every((child) => !child.name.startsWith('SmallQuad_Motor_')));
const screenshotPixels = (viewer) => {
  const target = new THREE.WebGLRenderTarget(384, 384);
  viewer.renderer.setRenderTarget(target);
  viewer.renderer.render(viewer.scene, viewer.camera);
  const pixels = new Uint8Array(384 * 384 * 4);
  viewer.renderer.readRenderTargetPixels(target, 0, 0, 384, 384, pixels);
  viewer.renderer.setRenderTarget(null);
  target.dispose();
  return pixels;
};
const pixelChange = (a, b) => a.reduce((count, value, index) => count + (Math.abs(value - b[index]) > 10 ? 1 : 0), 0);

try {
  stage('frame starts with empty motor housings');
  const { droneView } = await import('/src/main.ts');
  const { loadGltfAsset } = await import('/src/three/modelLoader.ts');
  const { configuration } = await import('/src/configurator/configuration.ts');
  await droneView.modelReady;
  check(!configuration.motor, 'no motor selected initially');
  select('frame', 'frame-aster-450');
  const frame = await droneView.modelReady;
  check(droneView.selectionAnimationPhase === 'frame', 'Aster selection starts arm/bolt assembly');
  check(droneView.frameSelectionDuration > 10 && droneView.frameSelectionDuration < 16,
    'frame motion removes timeline-wide held frames and camera-only gaps');
  check(noMotors(frame), 'no motor nodes or geometry exist at frame start');
  check(armNodes(frame).every(Boolean), 'all four runtime arm animation groups exist');
  const boltNames = [1,2,3,4].flatMap((arm) => ['Top','Bottom'].flatMap((side) =>
    [1,2,3,4].map((bolt) => `SmallQuad_Arm${String(arm).padStart(2,'0')}_Bolt_${side}_${String(bolt).padStart(2,'0')}`)));
  check(boltNames.length === 32 && boltNames.every((name) => frame.getObjectByName(name)),
    'all 32 bolt animation targets exist');
  const arms = armNodes(frame);
  const start = arms.map((arm) => arm.position.clone());
  const bolt = frame.getObjectByName('SmallQuad_Arm01_Bolt_Top_01');
  const boltStart = bolt.position.clone();
  const chassis = frame.getObjectByName('SmallQuad_TopPlate');
  const chassisStart = chassis.matrixWorld.clone();
  const startPixels = screenshotPixels(droneView);

  stage('arms and bolts move in approved sequence');
  droneView.seekSelectionAnimation(1);
  check(arms[0].position.distanceTo(start[0]) > 0.01, 'Arm_01 visibly moves');
  check(arms[1].position.distanceTo(start[1]) < 1e-5
    && arms[2].position.distanceTo(start[2]) < 1e-5
    && arms[3].position.distanceTo(start[3]) < 1e-5, 'later arms wait their turn');
  check(noMotors(frame), 'no motors appear while Arm_01 installs');
  const middlePixels = screenshotPixels(droneView);
  check(pixelChange(startPixels, middlePixels) > 100, 'frame motion changes rendered pixels');
  droneView.seekSelectionAnimation(2);
  check(bolt.position.distanceTo(boltStart) > 0.001, 'Arm_01 bolt visibly inserts');
  check(noMotors(frame), 'no motors appear while bolts install');
  droneView.seekSelectionAnimation(4);
  check(arms[1].position.distanceTo(start[1]) > 0.01, 'Arm_02 begins after Arm_01');
  check(arms[2].position.distanceTo(start[2]) < 1e-5, 'Arm_03 still waits');
  check(noMotors(frame), 'all four housings remain empty during frame assembly');
  const cameraBefore = droneView.camera.position.clone();
  droneView.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
  droneView.controls.update();
  check(droneView.camera.position.distanceTo(cameraBefore) > 0.001, 'OrbitControls work during selection animation');

  droneView.seekSelectionAnimation(droneView.frameSelectionDuration);
  check(droneView.selectionAnimationPhase === 'idle' && noMotors(frame),
    'frame completes with 32 bolts and four empty motor housings');
  check(arms.every((arm, index) => arm.position.distanceTo(start[index]) > 0.01),
    'all four arms reach distinct final transforms');
  frame.updateMatrixWorld(true);
  check(chassis.matrixWorld.elements.every((value, index) => near(value, chassisStart.elements[index])),
    'central chassis stays stationary');
  const staticTemplate = (await loadGltfAsset('/models/frames/aster-450/aster_450_quad.glb')).scene;
  staticTemplate.updateMatrixWorld(true);
  const relativeMatrix = (root, part) => root.matrixWorld.clone().invert().multiply(part.matrixWorld);
  for (const name of ['SmallQuad_Arm_01','SmallQuad_Arm_02','SmallQuad_Arm_03','SmallQuad_Arm_04',
    'SmallQuad_MotorHousing_01','SmallQuad_MotorHousing_02','SmallQuad_MotorHousing_03','SmallQuad_MotorHousing_04',
    ...boltNames]) {
    const actual = relativeMatrix(frame, frame.getObjectByName(name));
    const approved = relativeMatrix(staticTemplate, staticTemplate.getObjectByName(name));
    check(actual.elements.every((value, index) => near(value, approved.elements[index])),
      `${name}: final transform matches static GLB`);
  }

  stage('selected open motors install only after frame completion');
  select('motor', 'motor-m2216');
  await droneView.motorReady;
  check(droneView.selectionAnimationPhase === 'motor', 'motor selection starts motor-only stage');
  check(droneView.motorSelectionDuration > 4 && droneView.motorSelectionDuration < 7,
    'motor motion omits the long preceding Blender frame timeline');
  const openRoots = motorRoots(frame);
  check(openRoots.every(Boolean), 'four open motor instances exist');
  check(openRoots.every((root) => near(root.position.y, 0.075, 1e-4)),
    'all motors begin detached on their local mounting axes');
  const motorStartPixels = screenshotPixels(droneView);
  droneView.seekSelectionAnimation(0.6);
  check(openRoots[0].position.y < 0.075 - 0.005 && openRoots[0].position.y > 0,
    'Motor_01 visibly approaches its mount');
  check(near(openRoots[1].position.y, 0.075, 1e-4), 'Motor_02 waits until Motor_01 installation');
  check(pixelChange(motorStartPixels, screenshotPixels(droneView)) > 20,
    'motor motion changes rendered pixels');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  check(droneView.selectionAnimationPhase === 'idle'
    && openRoots.every((root) => near(root.position.y, 0, 1e-5)),
    'four open motors finish seated without duplicates');
  for (let index = 0; index < 4; index++) {
    const suffix = String(index + 1).padStart(2, '0');
    check(openRoots[index].getObjectByName(`SmallQuad_Motor${suffix}_PropellerMount`),
      'propeller anchor survives open-motor installation');
  }

  stage('closed variant replaces only motors');
  const armFinal = arms.map((arm) => arm.matrixWorld.clone());
  select('motor', 'motor-m2814');
  await droneView.motorReady;
  const closedRoots = motorRoots(frame);
  check(droneView.selectionAnimationPhase === 'motor', 'motor change does not restart frame assembly');
  check(openRoots.every((root) => root.parent === null), 'old open motors removed');
  check(closedRoots.every((root) => near(root.position.y, 0.075, 1e-4)),
    'closed motors start detached');
  check(arms.every((arm, index) => arm.matrixWorld.elements.every((value, element) =>
    near(value, armFinal[index].elements[element]))), 'arms remain assembled during motor change');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  check(closedRoots.every((root) => near(root.position.y, 0, 1e-5)),
    'four closed motors finish seated');
  select('motor', 'motor-m2216');
  await droneView.motorReady;
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  check(motorRoots(frame).every((root) => root.getObjectByName('SmallMotorOpen_Base')),
    'switching back installs four open motors');

  stage('unrelated changes and clear motor');
  const currentRoots = motorRoots(frame);
  select('battery', 'battery-b4-4000');
  await droneView.batteryReady;
  const payload = document.getElementById('payload');
  payload.value = '100';
  payload.dispatchEvent(new Event('input', { bubbles: true }));
  check(droneView.selectionAnimationPhase === 'battery'
    && motorRoots(frame).every((root, index) => root === currentRoots[index]),
    'battery and payload changes do not replay frame or motor assembly');
  droneView.seekSelectionAnimation(droneView.batterySelectionDuration);
  select('motor', '');
  await droneView.motorReady;
  check(noMotors(frame) && droneView.selectionAnimationPhase === 'idle',
    'clearing motor removes all four instances and leaves assembled frame');

  stage('switching frames cancels animation');
  select('frame', 'frame-aster-680');
  await droneView.modelReady;
  select('motor', 'motor-m2216');
  await droneView.motorReady;
  select('frame', 'frame-aster-450');
  const again = await droneView.modelReady;
  check(droneView.selectionAnimationPhase === 'frame' && noMotors(again),
    'preselected motor remains absent throughout new frame assembly');
  droneView.seekSelectionAnimation(droneView.frameSelectionDuration);
  await droneView.batteryReady;
  check(droneView.selectionAnimationPhase === 'battery' && noMotors(again),
    'preselected battery installs before motors');
  droneView.seekSelectionAnimation(droneView.batterySelectionDuration);
  await droneView.motorReady;
  check(droneView.selectionAnimationPhase === 'motor'
    && motorRoots(again).every((root) => root && near(root.position.y, 0.075, 1e-4)),
    'preselected motor installs only after frame completion');
  select('frame', 'frame-aster-680');
  const away = await droneView.modelReady;
  check(again.parent === null && away.parent === droneView.scene
    && droneView.selectionAnimationPhase === 'idle', 'switching away cancels obsolete motor animation');
  select('frame', 'frame-aster-450');
  const lateAster = await droneView.modelReady;
  check(droneView.selectionAnimationPhase === 'frame', 'returning to Aster replays frame assembly');
  select('frame', 'frame-aster-680');
  const finalAway = await droneView.modelReady;
  check(lateAster.parent === null && finalAway.parent === droneView.scene
    && droneView.selectionAnimationPhase === 'idle', 'switching away cancels obsolete arm animation');

  stage('motion-source fallback');
  const { initializeScene } = await import('/src/three/scene.ts');
  const fallbackContainer = document.createElement('div');
  fallbackContainer.style.cssText = 'width: 500px; height: 400px';
  document.body.append(fallbackContainer);
  const fetchBeforeFallback = window.fetch;
  const warnBeforeFallback = console.warn;
  const expectedWarnings = [];
  window.fetch = (input, init) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
    return path === '/models/animations/aster-450/aster450_full_assembly.glb'
      ? Promise.reject(new Error('Simulated motion-source failure'))
      : fetchBeforeFallback(input, init);
  };
  console.warn = (...args) => expectedWarnings.push(args);
  let fallbackViewer;
  try {
    fallbackViewer = initializeScene(fallbackContainer, 4, 'frame-aster-450');
    const staticFrame = await fallbackViewer.modelReady;
    check(staticFrame.visible && fallbackViewer.selectionAnimationPhase === 'idle',
      'motion failure shows usable assembled static frame');
    await fallbackViewer.setSelectedMotor('motor-m2216');
    await fallbackViewer.motorReady;
    check(motorRoots(staticFrame).every((root) => root && near(root.position.y, 0, 1e-5)),
      'motion failure mounts selected motors normally');
    check(expectedWarnings.some((args) => String(args[0]).includes('assembly motion unavailable')),
      'motion failure logs a clear warning');
  } finally {
    window.fetch = fetchBeforeFallback;
    console.warn = warnBeforeFallback;
    fallbackViewer?.renderer.setAnimationLoop(null);
    fallbackViewer?.controls.dispose();
    fallbackViewer?.renderer.dispose();
  }
  check(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  document.querySelector('#smoke-result').textContent =
    `PASS: visible motor-free arm and bolt assembly (${droneView.frameSelectionDuration.toFixed(2)} s); exact static final transforms; sequential open/closed motor installation (${droneView.motorSelectionDuration.toFixed(2)} s); independent selection stages; cancel and clear; no browser errors`;
} catch (error) {
  document.querySelector('#smoke-result').textContent = `FAIL: ${error.stack ?? error}; browser errors: ${errors.join('; ')}`;
} finally {
  console.error = originalError;
  console.warn = originalWarn;
}
