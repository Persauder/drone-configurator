import * as THREE from 'three';

const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const originalError = console.error;
const originalWarn = console.warn;
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
console.warn = (...args) => { errors.push(args.join(' ')); originalWarn(...args); };
const check = (condition, message) => { if (!condition) throw new Error(message); };
const stage = (text) => { document.querySelector('#smoke-result').textContent = `RUNNING: ${text}`; };
const select = (id, value) => {
  const element = document.getElementById(id);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mounts = (frame) => Array.from({ length: 4 }, (_, index) =>
  frame.getObjectByName(`SmallQuad_MotorMount_${String(index + 1).padStart(2, '0')}`));
const instances = (mount) => mount.children.filter((child) => /^SmallQuad_Motor_0[1-4]$/.test(child.name));

try {
  stage('load configurator');
  const { droneView } = await import('/src/main.ts');
  const { configuration } = await import('/src/configurator/configuration.ts');
  await droneView.modelReady;
  check(document.getElementById('assembly-actions').hidden, 'assembly control hidden on generic frame');

  stage('mount four open motors');
  select('frame', 'frame-aster-450');
  select('motor', 'motor-m2216');
  const frame = await droneView.modelReady;
  check(droneView.selectionAnimationPhase === 'frame', 'Aster selection starts frame-only assembly');
  check(mounts(frame).every((mount) => instances(mount).length === 0),
    'no motors are visible during arm assembly, even with a motor selected');
  droneView.seekSelectionAnimation(droneView.frameSelectionDuration);
  await droneView.motorReady;
  check(droneView.selectionAnimationPhase === 'motor', 'selected motors start only after frame assembly');
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  check(!document.getElementById('assembly-actions').hidden, 'assembly control visible for Aster 450 quad');
  check(mounts(frame).every(Boolean), 'four exported MotorMount anchors loaded');
  check(mounts(frame).every((mount) => instances(mount).length === 1), 'four distinct motor instances mounted');
  check(mounts(frame).every((mount, index) => instances(mount)[0].getObjectByName(
    `SmallQuad_Motor${String(index + 1).padStart(2, '0')}_PropellerMount`)),
    'each open motor preserves its propeller anchor');
  const originalInstances = mounts(frame).map((mount) => instances(mount)[0]);
  for (const [index, mount] of mounts(frame).entries()) {
    const motor = originalInstances[index];
    check(motor.position.length() < 1e-8 && motor.scale.x === 1 && motor.scale.y === 1 && motor.scale.z === 1,
      'motor inherits anchor position and real scale');
    const mountWorld = mount.getWorldPosition(new THREE.Vector3());
    const motorWorld = motor.getWorldPosition(new THREE.Vector3());
    const propWorld = motor.getObjectByName(`SmallQuad_Motor${String(index + 1).padStart(2, '0')}_PropellerMount`)
      .getWorldPosition(new THREE.Vector3());
    const base = motor.getObjectByName('SmallMotorOpen_Base');
    const baseBounds = new THREE.Box3().setFromObject(base);
    check(mountWorld.distanceTo(motorWorld) < 1e-6, 'motor origin coincides with mount axis');
    check(Math.abs(baseBounds.min.y - mountWorld.y) < 1e-5, 'motor base contacts exported recessed seat');
    check(Math.abs(propWorld.y - mountWorld.y - 0.027) < 1e-5,
      'propeller anchor remains above shaft on mounting axis');
  }

  stage('switch motor assets without duplicates');
  select('motor', 'motor-m2814');
  await droneView.motorReady;
  droneView.seekSelectionAnimation(droneView.motorSelectionDuration);
  check(mounts(frame).every((mount) => instances(mount).length === 1), 'closed motor selection retains one motor per mount');
  check(mounts(frame).every((mount, index) => instances(mount)[0].getObjectByName(
    `SmallQuad_Motor${String(index + 1).padStart(2, '0')}_PropellerMount`)),
    'closed motor anchors preserved');
  check(originalInstances.every((motor) => motor.parent === null), 'old motors detached');
  select('motor', 'motor-m2216');
  await droneView.motorReady;
  await Promise.all([
    droneView.setSelectedMotor('motor-m2814'),
    droneView.setSelectedMotor('motor-m2216'),
    droneView.setSelectedMotor('motor-m2814'),
  ]);
  await droneView.motorReady;
  check(mounts(frame).every((mount) => instances(mount).length === 1), 'rapid motor changes create no duplicates');
  select('motor', 'motor-m2216');
  await droneView.motorReady;

  stage('out-of-order motor requests');
  const { initializeScene } = await import('/src/three/scene.ts');
  const raceContainer = document.createElement('div');
  raceContainer.style.cssText = 'width: 500px; height: 400px';
  document.body.append(raceContainer);
  const race = initializeScene(raceContainer, 4, 'frame-aster-450');
  const raceFrame = await race.modelReady;
  race.seekSelectionAnimation(race.frameSelectionDuration);
  const fetchBeforeRace = window.fetch;
  const gates = new Map();
  for (const path of ['/models/motors/small/small_motor_open.glb', '/models/motors/small/small_motor_closed.glb']) {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    gates.set(path, { promise, release });
  }
  window.fetch = (input, init) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
    const gate = gates.get(path);
    return gate ? gate.promise.then(() => fetchBeforeRace(input, init)) : fetchBeforeRace(input, init);
  };
  try {
    const staleOpen = race.setSelectedMotor('motor-m2216');
    const newestClosed = race.setSelectedMotor('motor-m2814');
    gates.get('/models/motors/small/small_motor_closed.glb').release();
    await newestClosed;
    gates.get('/models/motors/small/small_motor_open.glb').release();
    await staleOpen;
    check(mounts(raceFrame).every((mount, index) => instances(mount).length === 1
      && instances(mount)[0].getObjectByName(
        `SmallQuad_Motor${String(index + 1).padStart(2, '0')}_PropellerMount`)),
    'late open-motor request cannot overwrite newer closed selection');
  } finally {
    window.fetch = fetchBeforeRace;
    race.renderer.setAnimationLoop(null);
    race.controls.dispose();
    race.renderer.dispose();
  }

  stage('cancel stale assembly load');
  const staleContainer = document.createElement('div');
  staleContainer.style.cssText = 'width: 500px; height: 400px';
  document.body.append(staleContainer);
  const staleViewer = initializeScene(staleContainer, 4, 'frame-aster-450');
  await staleViewer.modelReady;
  const fetchBeforeAssemblyRace = window.fetch;
  let releaseAssembly;
  const assemblyGate = new Promise((resolve) => { releaseAssembly = resolve; });
  window.fetch = (input, init) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
    return path === '/models/animations/aster-450/aster450_full_assembly.glb'
      ? assemblyGate.then(() => fetchBeforeAssemblyRace(input, init))
      : fetchBeforeAssemblyRace(input, init);
  };
  try {
    const staleAssembly = staleViewer.enterAssembly();
    const replacement = staleViewer.setDroneFrame(4, 'frame-aster-680');
    releaseAssembly();
    check(await staleAssembly === false, 'obsolete assembly request is ignored');
    const generic = await replacement;
    check(generic.getObjectByName('Quad_Body') && !staleViewer.scene.getObjectByName('Aster450_AssemblyPresentation'),
      'stale animated GLB cannot replace a newer frame selection');
  } finally {
    window.fetch = fetchBeforeAssemblyRace;
    staleViewer.renderer.setAnimationLoop(null);
    staleViewer.controls.dispose();
    staleViewer.renderer.dispose();
  }

  stage('play actual animated GLB');
  document.getElementById('assembly-open').click();
  for (let i = 0; i < 60 && droneView.assemblyStatus === 'loading'; i++) await wait(100);
  check(droneView.assemblyStatus === 'playing', 'assembly GLB loaded and playback started');
  check(frame.parent === null, 'modular configured frame hidden during presentation');
  const animated = droneView.scene.getObjectByName('Aster450_AssemblyPresentation');
  check(animated && animated.parent === droneView.scene, 'animated scene instance displayed');
  const arm = animated.getObjectByName('SmallQuad_Arm01_Assembly');
  check(arm, 'arm animation node found');
  const earlyProp = animated.getObjectByName('SmallQuad_Propeller_01_Mesh');
  const earlyCap = animated.getObjectByName('SmallQuad_PropNut_01_Mesh');
  check(earlyProp && earlyCap && earlyProp.scale.length() < 1e-5 && earlyCap.scale.length() < 1e-5,
    'dedicated full assembly begins with propellers and caps hidden');
  const initialX = arm.position.x;
  droneView.seekAssembly(2);
  check(Math.abs(arm.position.x - initialX) > 1e-5 && droneView.assemblyTime > 0,
    `AnimationMixer visibly advances an arm from exported keyframes (t=${droneView.assemblyTime}, duration=${droneView.assemblyDuration}, x=${initialX}->${arm.position.x}, status=${droneView.assemblyStatus})`);

  stage('pause, resume, restart');
  document.getElementById('assembly-pause').click();
  check(droneView.assemblyStatus === 'paused' && droneView.controls.enabled, 'pause stops playback and enables OrbitControls');
  const paused = droneView.assemblyTime;
  await wait(250);
  check(Math.abs(droneView.assemblyTime - paused) < 1e-4, 'paused mixer time stays fixed');
  document.getElementById('assembly-pause').click();
  check(droneView.assemblyStatus === 'playing', 'resume continues playback');
  droneView.seekAssembly(paused + 0.5);
  check(droneView.assemblyTime > paused, 'mixer advances after resume');
  document.getElementById('assembly-restart').click();
  check(droneView.assemblyTime < 0.2, 'restart resets to clip start');

  stage('finish, replay and restore configuration');
  droneView.seekAssembly(droneView.assemblyDuration);
  check(droneView.assemblyStatus === 'complete', 'full animation reaches final assembled pose');
  check(animated.parent === droneView.scene && droneView.controls.enabled,
    'completed model remains visible and inspectable');
  for (let index = 1; index <= 4; index++) {
    const suffix = String(index).padStart(2, '0');
    const prop = animated.getObjectByName(`SmallQuad_Propeller_${suffix}`);
    const cap = animated.getObjectByName(`SmallQuad_PropNut_${suffix}_Mesh`);
    check(prop && cap && cap.scale.x > 0.999,
      'dedicated full assembly finishes with four visible propellers and caps');
  }
  for (let index = 1; index <= 4; index++) {
    const suffix = String(index).padStart(2, '0');
    const motor = animated.getObjectByName(`SmallQuad_Motor_${suffix}`);
    const mount = animated.getObjectByName(`SmallQuad_MotorMount_${suffix}`);
    const propellerMount = animated.getObjectByName(`SmallQuad_Motor${suffix}_PropellerMount`);
    check(motor && mount && propellerMount, 'final animation retains motor and propeller anchors');
    check(motor.getWorldPosition(new THREE.Vector3()).distanceTo(mount.getWorldPosition(new THREE.Vector3())) < 1e-5,
      'final animated motor is seated on its mount axis');
  }
  const cameraBeforeOrbit = droneView.camera.position.clone();
  droneView.renderer.domElement.dispatchEvent(new WheelEvent('wheel', {
    deltaY: -100, bubbles: true, cancelable: true,
  }));
  droneView.controls.update();
  check(droneView.camera.position.distanceTo(cameraBeforeOrbit) > 0.001,
    'OrbitControls remain usable when inspecting the completed assembly');
  check(document.getElementById('assembly-restart').textContent === 'Replay', 'Replay shown at completion');
  document.getElementById('assembly-restart').click();
  check(droneView.assemblyStatus === 'playing' && droneView.assemblyTime < 0.2, 'Replay restarts');
  document.getElementById('assembly-exit').click();
  check(droneView.assemblyStatus === 'idle' && frame.parent === droneView.scene && animated.parent === null,
    'Exit restores modular frame and removes animation instance');
  check(configuration.frame.id === 'frame-aster-450' && configuration.rotorCount === 4
    && configuration.motor.id === 'motor-m2216', 'configuration state is preserved');
  check(mounts(frame).every((mount) => instances(mount).length === 1), 'four configured motors restored');
  select('frame', 'frame-aster-680');
  await droneView.modelReady;
  check(document.getElementById('assembly-actions').hidden, 'animation control hidden for non-Aster frame');
  check(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  document.querySelector('#smoke-result').textContent =
    'PASS: four modular motors; stable motor switching; real GLB arm motion; pause, resume, restart, completion, replay and exit; state preserved; no browser errors';
} catch (error) {
  document.querySelector('#smoke-result').textContent = `FAIL: ${error.stack ?? error}; browser errors: ${errors.join('; ')}`;
} finally {
  console.error = originalError;
  console.warn = originalWarn;
}
