import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/configurator/frameSelection';",
      "export * from './src/three/frameModels';",
      "export * from './src/data/frames';",
    ].join('\n'),
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { resolveRotorCount, resolveFrameModel, frames } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const aster450 = frames.find((frame) => frame.id === 'frame-aster-450');
const aster680 = frames.find((frame) => frame.id === 'frame-aster-680');
const aster960 = frames.find((frame) => frame.id === 'frame-aster-960');

test('Aster 450 auto-resolves its only allowed layout and rejects incompatible inputs', () => {
  assert.deepEqual(aster450.allowedRotorCounts, [4]);
  for (const requested of [undefined, 4, 6, 8, 0, NaN, Infinity]) {
    assert.equal(resolveRotorCount(aster450, requested), 4);
  }
  assert.equal(resolveRotorCount(undefined, 4), undefined);
});

test('frame switches resolve compatibility from allowedRotorCounts, including future single-layout frames', () => {
  assert.equal(resolveRotorCount(aster680, 8), undefined);
  assert.equal(resolveRotorCount(aster680, 6), 6);
  assert.equal(resolveRotorCount(aster960, 8), 8);
  assert.equal(resolveRotorCount(aster960, undefined), undefined);
  assert.equal(resolveRotorCount({ ...aster450, allowedRotorCounts: [6] }, 4), 6);
  assert.equal(resolveRotorCount({ ...aster450, allowedRotorCounts: [8] }, undefined), 8);
});

test('frame identity and layout independently resolve base and quad assets', () => {
  const base = '/models/frames/aster-450/aster_450_base.glb';
  const quad = '/models/frames/aster-450/aster_450_quad.glb';
  assert.equal(resolveFrameModel(aster450.id, undefined).path, base);
  assert.equal(resolveFrameModel(aster450.id, 4).path, quad);
  for (const invalid of [6, 8, NaN]) {
    const selection = resolveFrameModel(aster450.id, invalid);
    assert.equal(selection.path, base);
    assert.equal(selection.rotorCount, undefined);
  }
  assert.equal(resolveFrameModel(aster450.id, 4).anchors.length, 7);
  assert.ok(resolveFrameModel(aster450.id, 4).anchors.includes('SmallQuad_BatteryMount'));
  assert.equal(resolveFrameModel(aster680.id, 4).path, '/models/quad_frame.glb');
  assert.equal(resolveFrameModel(aster680.id, 6).path, '/models/hexa_frame.glb');
  assert.equal(resolveFrameModel(aster960.id, 8).path, '/models/octo_frame.glb');
  assert.equal(resolveFrameModel(aster680.id, 8).path, '/models/quad_frame.glb');
});
