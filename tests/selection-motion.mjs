import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export * from './src/three/selectionAnimations'; export { AnimationClip, VectorKeyframeTrack } from 'three';",
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { analyzeMotion, FRAME_CLIP_NAMES, ESC_CLIP_NAMES, MOTOR_CLIP_NAMES, PROPELLER_CLIP_NAMES,
  AnimationClip, VectorKeyframeTrack } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('selection clip lists include four arms, 32 bolts and four motors, excluding camera', () => {
  assert.equal(FRAME_CLIP_NAMES.length, 36);
  assert.equal(MOTOR_CLIP_NAMES.length, 4);
  assert.deepEqual(ESC_CLIP_NAMES, ['SmallQuad_ESC_4in1']);
  assert.equal(new Set(FRAME_CLIP_NAMES).size, 36);
  assert.ok(FRAME_CLIP_NAMES.includes('SmallQuad_Arm01_Assembly'));
  assert.ok(FRAME_CLIP_NAMES.includes('SmallQuad_Arm04_Bolt_Bottom_04'));
  assert.ok(MOTOR_CLIP_NAMES.includes('SmallQuad_Motor_04'));
  assert.ok(!FRAME_CLIP_NAMES.some((name) => name.includes('Motor_') || name.includes('Camera')));
  assert.equal(PROPELLER_CLIP_NAMES.length, 12);
  assert.ok(PROPELLER_CLIP_NAMES.includes('SmallQuad_Propeller_01'));
  assert.ok(PROPELLER_CLIP_NAMES.includes('SmallQuad_PropNut_04_Mesh'));
  assert.ok(PROPELLER_CLIP_NAMES.every((name) => !name.includes('Camera') && !name.includes('Arm')));
});

test('motion range ignores held tail and compresses only long idle intervals', () => {
  const track = new VectorKeyframeTrack('Node.position',
    [0, 1, 2, 10, 11, 20],
    [0,0,0, 0,0,0, 1,0,0, 1,0,0, 2,0,0, 2,0,0]);
  const window = analyzeMotion([new AnimationClip('Node', 20, [track])], ['Node']);
  assert.equal(window.firstChange, 1);
  assert.equal(window.lastChange, 11);
  assert.ok(Math.abs(window.duration - 2.35) < 1e-6);
  assert.ok(Math.abs(window.removedIdle - 8.65) < 1e-6);
});
