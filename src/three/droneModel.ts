import * as THREE from 'three';

const ARM_LENGTH = 1.7;

export function createDroneModel(rotorCount: number): THREE.Group {
  if (![4, 6, 8].includes(rotorCount)) {
    throw new RangeError('Drone model supports 4, 6 or 8 rotors.');
  }

  const drone = new THREE.Group();
  drone.name = 'drone';

  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x3c82f6, metalness: 0.3, roughness: 0.5 });
  const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.4 });
  const propellerMaterial = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.1, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.85), frameMaterial);
  body.name = 'body';
  drone.add(body);

  // Reuse geometry and materials for identical parts within this model.
  const armGeometry = new THREE.BoxGeometry(ARM_LENGTH, 0.12, 0.14);
  const motorGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.24, 16);
  const propellerGeometry = new THREE.BoxGeometry(0.95, 0.035, 0.1);

  for (let index = 0; index < rotorCount; index++) {
    const angle = (index / rotorCount) * Math.PI * 2;
    const x = Math.cos(angle) * ARM_LENGTH;
    const z = Math.sin(angle) * ARM_LENGTH;

    const arm = new THREE.Mesh(armGeometry, frameMaterial);
    arm.name = `arm-${index + 1}`;
    arm.position.set(x / 2, 0, z / 2);
    // BoxGeometry runs along local X; negative Y rotation points it toward (x, z).
    arm.rotation.y = -angle;
    drone.add(arm);

    const motor = new THREE.Mesh(motorGeometry, motorMaterial);
    motor.name = `motor-${index + 1}`;
    motor.position.set(x, 0.16, z);
    drone.add(motor);

    const propeller = new THREE.Mesh(propellerGeometry, propellerMaterial);
    propeller.name = `propeller-${index + 1}`;
    propeller.position.set(x, 0.32, z);
    propeller.rotation.y = -angle;
    drone.add(propeller);
  }

  drone.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });

  return drone;
}
