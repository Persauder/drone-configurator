import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/three/droneModel.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { createDroneModel } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

for (const rotorCount of [4, 6, 8]) {
  test(`procedural drone: ${rotorCount} evenly spaced motors, connected arms and raised propellers`, () => {
    const drone = createDroneModel(rotorCount);
    assert.equal(drone.isGroup, true);
    assert.equal(drone.children.filter((part) => part.name.startsWith('motor-')).length, rotorCount);
    assert.equal(drone.children.filter((part) => part.name.startsWith('arm-')).length, rotorCount);
    assert.equal(drone.children.filter((part) => part.name.startsWith('propeller-')).length, rotorCount);
    assert.equal(drone.children.filter((part) => part.name === 'body').length, 1);
    drone.updateMatrixWorld(true);

    const radius = drone.getObjectByName('motor-1').position.length();
    for (let index = 0; index < rotorCount; index++) {
      const motor = drone.getObjectByName(`motor-${index + 1}`);
      const arm = drone.getObjectByName(`arm-${index + 1}`);
      const propeller = drone.getObjectByName(`propeller-${index + 1}`);
      const angle = (index / rotorCount) * Math.PI * 2;
      const horizontalRadius = Math.hypot(motor.position.x, motor.position.z);
      assert.ok(Math.abs(motor.position.length() - radius) < 1e-10);
      assert.ok(Math.abs(motor.position.x - Math.cos(angle) * horizontalRadius) < 1e-10);
      assert.ok(Math.abs(motor.position.z - Math.sin(angle) * horizontalRadius) < 1e-10);
      const armLength = arm.geometry.parameters.width;
      const start = new THREE.Vector3(-armLength / 2, 0, 0).applyMatrix4(arm.matrixWorld);
      const end = new THREE.Vector3(armLength / 2, 0, 0).applyMatrix4(arm.matrixWorld);
      assert.ok(start.length() < 1e-10, 'arm starts at the center');
      assert.ok(Math.abs(end.x - motor.position.x) < 1e-10 && Math.abs(end.z - motor.position.z) < 1e-10,
        'arm ends at its motor');
      assert.equal(propeller.position.x, motor.position.x);
      assert.equal(propeller.position.z, motor.position.z);
      assert.ok(propeller.position.y - propeller.geometry.parameters.height / 2
        > motor.position.y + motor.geometry.parameters.height / 2, 'propeller clears the motor');
    }

    drone.traverse((part) => {
      assert.ok([...part.matrixWorld.elements].every(Number.isFinite));
      if (!part.isMesh) return;
      assert.ok([...part.geometry.attributes.position.array].every(Number.isFinite), 'finite geometry vertices');
      assert.ok([...part.geometry.attributes.normal.array].every(Number.isFinite), 'finite geometry normals');
      assert.equal(part.material.isMeshStandardMaterial, true);
    });
    const bounds = new THREE.Box3().setFromObject(drone);
    assert.ok(!bounds.isEmpty());
    assert.ok(bounds.min.y > -0.51, 'drone is above the scene grid');

    const geometries = new Set();
    const materials = new Set();
    drone.traverse((part) => {
      if (part.isMesh) { geometries.add(part.geometry); materials.add(part.material); }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  });
}

test('procedural drone rejects unsupported or non-finite rotor counts', () => {
  for (const rotorCount of [0, -4, 3, 5, 4.5, NaN, Infinity]) {
    assert.throws(() => createDroneModel(rotorCount), RangeError);
  }
});
