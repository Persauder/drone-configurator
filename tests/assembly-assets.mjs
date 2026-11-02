import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: {
    contents: "export * from './src/three/frameModels'; export * from './src/three/motorModels'; export * from './src/three/propellerModels'; export * from './src/three/escModels'; export * from './src/three/batteryModels'; export * from './src/three/assemblyModels';",
    resolveDir: root,
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { resolveFrameModel, resolveMotorModel, resolvePropellerModel, resolveEscModel, resolveBatteryModel,
  ASTER_PROPELLER_HANDEDNESS, PROPELLER_CAP_PATH, resolveAssemblyModel } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
}

test('stable frame and motor IDs resolve to separate approved assets', () => {
  assert.equal(resolveFrameModel('frame-aster-450', 4).path,
    '/models/frames/aster-450/aster_450_quad.glb');
  assert.equal(resolveAssemblyModel('frame-aster-450', 4),
    '/models/animations/aster-450/aster450_full_assembly.glb');
  for (const [id, rotors] of [['frame-aster-450', 6], ['frame-aster-680', 4], ['frame-aster-960', 8]]) {
    assert.equal(resolveAssemblyModel(id, rotors), undefined);
  }
  assert.equal(resolveMotorModel('motor-m2216'), '/models/motors/small/small_motor_open.glb');
  assert.equal(resolveMotorModel('motor-m2814'), '/models/motors/small/small_motor_closed.glb');
  assert.equal(resolveMotorModel('motor-m3110'), undefined);
  assert.deepEqual(resolvePropellerModel('propeller-p9045'), {
    cw: '/models/propellers/small/small_propeller_cw.glb',
    ccw: '/models/propellers/small/small_propeller_ccw.glb',
  });
  assert.equal(resolvePropellerModel('propeller-p1045'), undefined);
  assert.equal(resolvePropellerModel(undefined), undefined);
  assert.deepEqual(ASTER_PROPELLER_HANDEDNESS, ['cw', 'ccw', 'cw', 'ccw']);
  assert.equal(PROPELLER_CAP_PATH, '/models/propellers/small/small_prop_retaining_cap.glb');
  assert.equal(resolveEscModel('esc-v25'), '/models/escs/small/small_esc_4in1.glb');
  assert.equal(resolveBatteryModel('battery-b4-4000'), '/models/batteries/small/small_battery.glb');
  assert.equal(resolveBatteryModel('battery-b4-6000'), undefined);
  assert.equal(resolveBatteryModel(undefined), undefined);
  assert.equal(resolveEscModel('esc-v40'), undefined);
  assert.equal(resolveEscModel(undefined), undefined);
});

test('central 4-in-1 ESC GLB has housing, fins, 12 motor outputs and no animation', async () => {
  const glb = parseGlb(await readFile(new URL('../public/models/escs/small/small_esc_4in1.glb', import.meta.url)));
  const names = new Set(glb.nodes.map((node) => node.name));
  for (const name of ['SmallESC_4in1_Assembly', 'SmallESC_Mount', 'SmallESC_HeatSink',
    'SmallESC_Power_Positive', 'SmallESC_Power_Negative',
    ...[1, 2, 3, 4].flatMap((motor) => ['A', 'B', 'C'].map((phase) =>
      `SmallESC_Motor${String(motor).padStart(2, '0')}_Phase_${phase}`))]) {
    assert.ok(names.has(name), name);
  }
  assert.equal(glb.animations?.length ?? 0, 0);
});

test('wrapped battery GLB is one modular pack with connector and electrical anchors', async () => {
  const glb = parseGlb(await readFile(new URL('../public/models/batteries/small/small_battery.glb', import.meta.url)));
  const names = new Set(glb.nodes.map((node) => node.name));
  for (const name of ['SmallBattery_Assembly', 'SmallBattery_Body', 'SmallBattery_Label',
    'SmallBattery_Cable_Positive', 'SmallBattery_Cable_Negative',
    'SmallBattery_Connector', 'SmallBattery_Mount',
    'SmallBattery_Positive', 'SmallBattery_Negative']) assert.ok(names.has(name), name);
  assert.equal(glb.animations?.length ?? 0, 0);
});

test('CW, CCW and retaining-cap GLBs remain separate approved components', async () => {
  for (const [filename, expected] of [
    ['small_propeller_cw.glb', 'SmallProp_CW'],
    ['small_propeller_ccw.glb', 'SmallProp_CCW'],
    ['small_prop_retaining_cap.glb', 'SmallProp_RetainingNut'],
  ]) {
    const glb = parseGlb(await readFile(new URL(`../public/models/propellers/small/${filename}`, import.meta.url)));
    assert.deepEqual(glb.nodes.map((node) => node.name), [expected]);
    assert.equal(glb.animations?.length ?? 0, 0);
  }
});

test('static frame has one central ESCMount and remains component-free', async () => {
  const glb = parseGlb(await readFile(new URL('../public/models/frames/aster-450/aster_450_quad.glb', import.meta.url)));
  const names = new Set(glb.nodes.map((node) => node.name));
  for (let index = 1; index <= 4; index++) {
    assert.ok(names.has(`SmallQuad_MotorMount_${String(index).padStart(2, '0')}`));
    assert.ok(!names.has(`SmallQuad_ESCMount_${String(index).padStart(2, '0')}`));
    assert.ok(!names.has(`SmallQuad_ESC_${String(index).padStart(2, '0')}`));
  }
  assert.ok(names.has('SmallQuad_ESCMount'));
  const escMount = glb.nodes.find((node) => node.name === 'SmallQuad_ESCMount');
  assert.ok(Math.abs(escMount.translation[0]) < 1e-6);
  assert.ok(Math.abs(escMount.translation[1] - 0.01105) < 1e-6);
  assert.ok(Math.abs(escMount.translation[2] + 0.0285) < 1e-6);
  assert.ok(Math.abs(escMount.rotation[1] - Math.SQRT1_2) < 1e-6);
  assert.ok(!names.has('SmallQuad_Motor_01'));
  assert.ok(!names.has('SmallQuad_ESC_4in1'));
  assert.ok(names.has('SmallQuad_BatteryMount'));
  assert.ok(!names.has('SmallQuad_Battery'));
  const batteryMount = glb.nodes.find((node) => node.name === 'SmallQuad_BatteryMount');
  assert.ok(Math.abs(batteryMount.translation[0]) < 1e-6);
  assert.ok(Math.abs(batteryMount.translation[1] + 0.0115) < 1e-6);
  assert.ok(Math.abs(batteryMount.translation[2] - 0.032) < 1e-6);
});

test('animated GLB contains arm, bolt, ESC, battery, motor, propeller, cap and camera tracks', async () => {
  const glb = parseGlb(await readFile(new URL('../public/models/animations/aster-450/aster450_full_assembly.glb', import.meta.url)));
  const names = new Set(glb.nodes.map((node) => node.name));
  for (let index = 1; index <= 4; index++) {
    const suffix = String(index).padStart(2, '0');
    assert.ok(names.has(`SmallQuad_MotorMount_${suffix}`));
    assert.ok(!names.has(`SmallQuad_ESCMount_${suffix}`));
    assert.ok(!names.has(`SmallQuad_ESC_${suffix}`));
    assert.ok(names.has(`SmallQuad_Motor_${suffix}`));
    assert.ok(names.has(`SmallQuad_Motor${suffix}_PropellerMount`));
    assert.ok(names.has(`SmallQuad_Arm${suffix}_Assembly`));
    assert.ok(names.has(`SmallQuad_Propeller_${suffix}`));
    assert.ok(names.has(`SmallQuad_PropNut_${suffix}`));
  }
  assert.ok(names.has('SmallQuad_ESCMount'));
  assert.ok(names.has('SmallQuad_ESC_4in1'));
  assert.ok(names.has('SmallQuad_BatteryMount'));
  assert.ok(names.has('SmallQuad_Battery'));
  assert.ok(!names.has('SmallQuad_BatteryReservedVolume'));
  assert.ok(glb.animations.length > 0);
  const clipNames = new Set(glb.animations.map((clip) => clip.name));
  assert.ok(clipNames.has('SmallQuad_Motor_01'));
  assert.ok(clipNames.has('SmallQuad_ESC_4in1'));
  assert.ok(clipNames.has('SmallQuad_Battery'));
  assert.ok(clipNames.has('SmallQuad_Arm01_Assembly'));
  assert.ok(clipNames.has('SmallQuad_Arm04_Bolt_Top_04'));
  assert.ok(clipNames.has('SmallQuad_Propeller_01'));
  assert.ok(clipNames.has('SmallQuad_PropNut_04'));
  assert.ok(clipNames.has('SmallQuad_PropNut_04_Mesh'));
  const durations = glb.animations.map((clip) => Math.max(...clip.samplers.map((sampler) =>
    glb.accessors[sampler.input].max[0])));
  assert.ok(durations.every((duration) => duration > 48 && duration < 50));
});
