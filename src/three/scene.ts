import * as THREE from 'three';
import { createOrbitControls } from './controls';
import { createDroneModel } from './droneModel';
import { loadDroneModel, loadGltfAsset } from './modelLoader';
import { resolveFrameModel } from './frameModels';
import { resolveMotorModel } from './motorModels';
import { resolveEscModel } from './escModels';
import { resolveBatteryModel } from './batteryModels';
import { ASTER_PROPELLER_HANDEDNESS, PROPELLER_CAP_PATH, resolvePropellerModel } from './propellerModels';
import { resolveAssemblyModel } from './assemblyModels';
import { prepareFrameAssembly, prepareEscInstallation, prepareBatteryInstallation, prepareMotorInstallation, preparePropellerInstallation } from './selectionAnimations';
import type { SelectionPlayback } from './selectionAnimations';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AssemblyStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'complete' | 'error';

export function initializeScene(container: HTMLElement, initialRotorCount?: number, initialFrameId?: string) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1018);
  scene.fog = new THREE.Fog(0x0b1018, 10, 24);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(4.5, 3.4, 5.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x202735, 1.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(4, 7, 3);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const grid = new THREE.GridHelper(12, 24, 0x3c82f6, 0x263140);
  grid.position.y = -0.51;
  scene.add(grid);

  const controls = createOrbitControls(camera, renderer);
  let modelBounds: THREE.Box3 | undefined;
  let currentFrame: THREE.Group | undefined;
  let currentIsFallback = false;
  let requestVersion = 0;
  let requestedModelPath: string | undefined;
  let modelReady: Promise<THREE.Group | undefined> = Promise.resolve(undefined);
  const modelCache = new Map<string, Promise<THREE.Group>>();
  const motorCache = new Map<string, Promise<THREE.Group>>();
  const escCache = new Map<string, Promise<THREE.Group>>();
  const batteryCache = new Map<string, Promise<THREE.Group>>();
  const propellerCache = new Map<string, Promise<THREE.Group>>();
  const assemblyCache = new Map<string, Promise<GLTF>>();
  let selectedMotorId: string | undefined;
  let selectedEscId: string | undefined;
  let selectedBatteryId: string | undefined;
  let selectedPropellerId: string | undefined;
  let currentFrameId: string | undefined;
  let currentRotorCount: number | undefined;
  let loadedFrameId: string | undefined;
  let loadedRotorCount: number | undefined;
  let motorVersion = 0;
  let motorReady: Promise<void> = Promise.resolve();
  let escReady: Promise<void> = Promise.resolve();
  let batteryReady: Promise<void> = Promise.resolve();
  let propellerReady: Promise<void> = Promise.resolve();
  let mountedMotors: THREE.Group[] = [];
  let mountedEscs: THREE.Group[] = [];
  let mountedBatteries: THREE.Group[] = [];
  let restoreEscPlateMaterials: Array<() => void> = [];
  let restoreEscCamera: (() => void) | undefined;
  let mountedPropellers: THREE.Group[] = [];
  let mountedPropNuts: THREE.Group[] = [];
  let frameMotion: SelectionPlayback | undefined;
  let motorMotion: SelectionPlayback | undefined;
  let escMotion: SelectionPlayback | undefined;
  let batteryMotion: SelectionPlayback | undefined;
  let propellerMotion: SelectionPlayback | undefined;
  let frameAssembled = true;
  let motorAssembled = false;
  let lastFrameMotionDuration = 0;
  let lastMotorMotionDuration = 0;
  let lastEscMotionDuration = 0;
  let lastBatteryMotionDuration = 0;
  let lastPropellerMotionDuration = 0;
  let propellerVersion = 0;
  let escVersion = 0;
  let batteryVersion = 0;
  let continueFrameSequenceAfterEsc = false;
  let continueFrameSequenceAfterBattery = false;
  let escStageActive = false;
  let assemblyVersion = 0;
  let assemblyRoot: THREE.Group | undefined;
  let assemblyMixer: THREE.AnimationMixer | undefined;
  let assemblyActions: THREE.AnimationAction[] = [];
  let assemblyDuration = 0;
  let assemblyTime = 0;
  let assemblyStatus: AssemblyStatus = 'idle';
  let assemblyListener: ((status: AssemblyStatus) => void) | undefined;

  const setAssemblyStatus = (status: AssemblyStatus): void => {
    assemblyStatus = status;
    assemblyListener?.(status);
  };

  const clearPropellers = (): void => {
    ++propellerVersion;
    propellerMotion?.cancel();
    propellerMotion = undefined;
    for (const propeller of mountedPropellers) propeller.removeFromParent();
    for (const nut of mountedPropNuts) nut.removeFromParent();
    mountedPropellers = [];
    mountedPropNuts = [];
  };

  const clearMotors = (): void => {
    clearPropellers();
    motorMotion?.cancel();
    motorMotion = undefined;
    motorAssembled = false;
    for (const motor of mountedMotors) motor.removeFromParent();
    mountedMotors = [];
  };

  const clearEscs = (): void => {
    ++escVersion;
    continueFrameSequenceAfterEsc = false;
    escStageActive = false;
    escMotion?.cancel();
    escMotion = undefined;
    restoreEscPlateMaterials.forEach((restore) => restore());
    restoreEscPlateMaterials = [];
    restoreEscCamera?.();
    restoreEscCamera = undefined;
    for (const esc of mountedEscs) esc.removeFromParent();
    mountedEscs = [];
  };

  const clearBatteries = (): void => {
    ++batteryVersion;
    continueFrameSequenceAfterBattery = false;
    batteryMotion?.cancel();
    batteryMotion = undefined;
    for (const battery of mountedBatteries) battery.removeFromParent();
    mountedBatteries = [];
  };

  const revealCentralEscDuringInstall = (frame: THREE.Group): void => {
    const plate = frame.getObjectByName('SmallQuad_TopPlate');
    plate?.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      const original = part.material;
      const originals = Array.isArray(original) ? original : [original];
      const temporary = originals.map((material: THREE.Material) => {
        const copy = material.clone() as THREE.MeshStandardMaterial;
        copy.transparent = true;
        copy.opacity = 0.28;
        copy.depthWrite = false;
        return copy;
      });
      part.material = Array.isArray(original) ? temporary : temporary[0];
      restoreEscPlateMaterials.push(() => {
        part.material = original;
        temporary.forEach((material) => material.dispose());
      });
    });
  };

  const focusCentralEscDuringInstall = (mount: THREE.Object3D): void => {
    const previousPosition = camera.position.clone();
    const previousTarget = controls.target.clone();
    const previousMinimum = controls.minDistance;
    const center = mount.getWorldPosition(new THREE.Vector3());
    controls.minDistance = 0.08;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0.20, 0.08, 0.20));
    controls.update();
    restoreEscCamera = () => {
      camera.position.copy(previousPosition);
      controls.target.copy(previousTarget);
      controls.minDistance = previousMinimum;
      controls.update();
    };
  };

  const loadMotionAsset = (): Promise<GLTF> => {
    const path = resolveAssemblyModel('frame-aster-450', 4)!;
    let ready = assemblyCache.get(path);
    if (!ready) {
      ready = loadGltfAsset(path).catch((error: unknown) => {
        assemblyCache.delete(path);
        throw error;
      });
      assemblyCache.set(path, ready);
    }
    return ready;
  };

  const loadComponentTemplate = (path: string, cache: Map<string, Promise<THREE.Group>>): Promise<THREE.Group> => {
    let ready = cache.get(path);
    if (!ready) {
      ready = loadGltfAsset(path).then((asset) => asset.scene).catch((error: unknown) => {
        cache.delete(path);
        throw error;
      });
      cache.set(path, ready);
    }
    return ready;
  };

  const mountSelectedPropeller = (): Promise<void> => {
    clearPropellers();
    const version = propellerVersion;
    const motorGeneration = motorVersion;
    const frame = currentFrame;
    const pair = resolvePropellerModel(selectedPropellerId);
    if (!frame || !frameAssembled || !motorAssembled || mountedMotors.length !== 4 || !pair
      || currentIsFallback || currentFrameId !== 'frame-aster-450' || currentRotorCount !== 4
      || loadedFrameId !== currentFrameId || loadedRotorCount !== currentRotorCount) {
      propellerReady = Promise.resolve();
      return propellerReady;
    }
    const anchors = mountedMotors.map((motor, index) =>
      motor.getObjectByName(`SmallQuad_Motor${String(index + 1).padStart(2, '0')}_PropellerMount`));
    if (anchors.some((anchor) => !anchor)) {
      console.warn('Selected motor is missing an Aster 450 PropellerMount anchor; propellers were not placed.');
      propellerReady = Promise.resolve();
      return propellerReady;
    }
    propellerReady = Promise.all([
      loadComponentTemplate(pair.cw, propellerCache),
      loadComponentTemplate(pair.ccw, propellerCache),
      loadComponentTemplate(PROPELLER_CAP_PATH, propellerCache),
      loadMotionAsset().catch((error: unknown) => {
        console.warn('Aster 450 propeller motion unavailable; mounting propellers in their final positions.', error);
        return undefined;
      }),
    ]).then(([cw, ccw, cap, motion]) => {
      if (version !== propellerVersion || motorGeneration !== motorVersion || frame !== currentFrame) return;
      const propellers: THREE.Group[] = [];
      const nuts: THREE.Group[] = [];
      for (let index = 0; index < 4; index++) {
        const suffix = String(index + 1).padStart(2, '0');
        const anchor = anchors[index]!;
        const propeller = new THREE.Group();
        propeller.name = `SmallQuad_Propeller_${suffix}`;
        propeller.visible = false;
        // glTF is Y-up. Keep the named runtime root's local +Z on the shaft
        // for future RPM control, while the imported blade mesh stays seated.
        propeller.rotation.x = -Math.PI / 2;
        const visual = (ASTER_PROPELLER_HANDEDNESS[index] === 'cw' ? cw : ccw).clone(true);
        visual.name = `SelectedPropellerVisual_${suffix}`;
        visual.rotation.x = Math.PI / 2;
        visual.traverse((part) => {
          if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; }
        });
        propeller.add(visual);
        anchor.add(propeller);
        propellers.push(propeller);

        const nut = new THREE.Group();
        nut.name = `SmallQuad_PropNut_${suffix}`;
        nut.visible = false;
        const capVisual = cap.clone(true);
        capVisual.name = `SelectedPropNutVisual_${suffix}`;
        const capMesh = capVisual.getObjectByName('SmallProp_RetainingNut');
        if (!capMesh) throw new Error(`Retaining cap GLB is missing SmallProp_RetainingNut.`);
        capMesh.name = `SmallQuad_PropNut_${suffix}_Mesh`;
        if (capMesh instanceof THREE.Mesh) {
          capMesh.castShadow = true;
          capMesh.receiveShadow = true;
        }
        nut.add(capVisual);
        anchor.add(nut);
        nuts.push(nut);
      }
      mountedPropellers = propellers;
      mountedPropNuts = nuts;
      if (motion) {
        try {
          const prepared = preparePropellerInstallation(frame, motion.animations);
          propellerMotion = prepared.playback;
          lastPropellerMotionDuration = prepared.window.duration;
        } catch (error) {
          console.warn('Aster 450 propeller clips could not bind; mounting in final positions.', error);
        }
      }
      propellers.forEach((root) => { root.visible = true; });
      nuts.forEach((root) => { root.visible = true; });
    }, (error: unknown) => {
      if (version === propellerVersion) console.warn('Aster 450 propeller assets unavailable.', error);
    });
    return propellerReady;
  };

  const setSelectedPropeller = (propellerId?: string): Promise<void> => {
    selectedPropellerId = propellerId;
    return mountSelectedPropeller();
  };

  const mountSelectedMotor = (): Promise<void> => {
    const version = ++motorVersion;
    clearMotors();
    const frame = currentFrame;
    const path = resolveMotorModel(selectedMotorId);
    if (!frame || !frameAssembled || currentIsFallback || !path
      || currentFrameId !== 'frame-aster-450' || currentRotorCount !== 4
      || loadedFrameId !== currentFrameId || loadedRotorCount !== currentRotorCount) {
      motorReady = Promise.resolve();
      return motorReady;
    }
    let templateReady = motorCache.get(path);
    if (!templateReady) {
      templateReady = loadGltfAsset(path).then((asset) => asset.scene).catch((error: unknown) => {
        motorCache.delete(path);
        throw error;
      });
      motorCache.set(path, templateReady);
    }
    motorReady = Promise.all([templateReady, loadMotionAsset().catch((error: unknown) => {
      console.warn('Aster 450 motor motion unavailable; mounting motors in their final positions.', error);
      return undefined;
    })]).then(([template, motion]) => {
      if (version !== motorVersion || frame !== currentFrame) return;
      const instances: THREE.Group[] = [];
      for (let index = 1; index <= 4; index++) {
        const suffix = String(index).padStart(2, '0');
        const anchor = frame.getObjectByName(`SmallQuad_MotorMount_${suffix}`);
        if (!anchor) {
          console.warn(`Aster 450 motor mount ${suffix} is missing from the frame GLB.`);
          instances.forEach((motor) => motor.removeFromParent());
          return;
        }
        const motor = new THREE.Group();
        motor.name = `SmallQuad_Motor_${suffix}`;
        motor.visible = false;
        const visual = template.clone(true);
        visual.name = `SelectedMotorVisual_${suffix}`;
        const propellerMount = visual.getObjectByName('SmallMotorOpen_PropellerMount')
          ?? visual.getObjectByName('SmallMotor_PropellerMount');
        if (!propellerMount) throw new Error(`Motor GLB "${path}" has no PropellerMount anchor.`);
        propellerMount.name = `SmallQuad_Motor${suffix}_PropellerMount`;
        visual.traverse((part) => {
          if (part instanceof THREE.Mesh) {
            part.castShadow = true;
            part.receiveShadow = true;
          }
        });
        motor.add(visual);
        anchor.add(motor);
        instances.push(motor);
      }
      mountedMotors = instances;
      if (motion) {
        try {
          const prepared = prepareMotorInstallation(frame, motion.animations);
          motorMotion = prepared.playback;
          lastMotorMotionDuration = prepared.window.duration;
        } catch (error) {
          console.warn('Aster 450 motor clips could not bind; mounting motors in their final positions.', error);
        }
      }
      instances.forEach((motor) => { motor.visible = true; });
      motorAssembled = !motorMotion;
      if (motorAssembled) void mountSelectedPropeller();
    }, (error: unknown) => {
      if (version === motorVersion) console.warn(`Motor GLB "${path}" unavailable.`, error);
    });
    return motorReady;
  };

  const setSelectedMotor = (motorId?: string): Promise<void> => {
    selectedMotorId = motorId;
    return mountSelectedMotor();
  };

  const mountSelectedBattery = (continueToMotors = false): Promise<void> => {
    clearBatteries();
    continueFrameSequenceAfterBattery = continueToMotors;
    const version = batteryVersion;
    const frame = currentFrame;
    const path = resolveBatteryModel(selectedBatteryId);
    const continueSequence = (): void => {
      if (continueFrameSequenceAfterBattery && frameAssembled) {
        continueFrameSequenceAfterBattery = false;
        void mountSelectedMotor();
      }
    };
    if (!frame || !frameAssembled || currentIsFallback || !path
      || currentFrameId !== 'frame-aster-450' || currentRotorCount !== 4
      || loadedFrameId !== currentFrameId || loadedRotorCount !== currentRotorCount) {
      batteryReady = Promise.resolve();
      continueSequence();
      return batteryReady;
    }
    const anchor = frame.getObjectByName('SmallQuad_BatteryMount');
    if (!anchor) {
      console.warn('Aster 450 frame is missing SmallQuad_BatteryMount; battery was not placed.');
      batteryReady = Promise.resolve();
      continueSequence();
      return batteryReady;
    }
    batteryReady = Promise.all([loadComponentTemplate(path, batteryCache),
      loadMotionAsset().catch((error: unknown) => {
        console.warn('Aster 450 battery motion unavailable; mounting battery in its final position.', error);
        return undefined;
      })]).then(([template, motion]) => {
      if (version !== batteryVersion || frame !== currentFrame) return;
      const battery = new THREE.Group();
      battery.name = 'SmallQuad_Battery';
      battery.visible = false;
      const visual = template.clone(true);
      visual.name = 'SelectedBatteryVisual';
      visual.traverse((part) => {
        if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; }
      });
      battery.add(visual);
      anchor.add(battery);
      mountedBatteries = [battery];
      if (motion) {
        try {
          const prepared = prepareBatteryInstallation(frame, motion.animations);
          batteryMotion = prepared.playback;
          lastBatteryMotionDuration = prepared.window.duration;
        } catch (error) {
          console.warn('Aster 450 battery clip could not bind; mounting in its final position.', error);
        }
      }
      battery.visible = true;
      if (!batteryMotion) continueSequence();
    }, (error: unknown) => {
      if (version === batteryVersion) {
        console.warn(`Battery GLB "${path}" unavailable.`, error);
        continueSequence();
      }
    });
    return batteryReady;
  };

  const setSelectedBattery = (batteryId?: string): Promise<void> => {
    selectedBatteryId = batteryId;
    if (escStageActive) {
      clearBatteries();
      batteryReady = Promise.resolve();
      return batteryReady;
    }
    return mountSelectedBattery();
  };

  const mountSelectedEsc = (continueToBattery = false): Promise<void> => {
    clearEscs();
    continueFrameSequenceAfterEsc = continueToBattery;
    const version = escVersion;
    const frame = currentFrame;
    const path = resolveEscModel(selectedEscId);
    if (!frame || !frameAssembled || currentIsFallback || !path
      || currentFrameId !== 'frame-aster-450' || currentRotorCount !== 4
      || loadedFrameId !== currentFrameId || loadedRotorCount !== currentRotorCount) {
      escReady = Promise.resolve();
      if (continueFrameSequenceAfterEsc && frameAssembled) {
        continueFrameSequenceAfterEsc = false;
        void mountSelectedBattery(true);
      }
      return escReady;
    }
    escStageActive = true;
    const anchor = frame.getObjectByName('SmallQuad_ESCMount');
    if (!anchor) {
      console.warn('Aster 450 frame is missing its central ESCMount anchor; ESC was not placed.');
      escReady = Promise.resolve();
      if (continueFrameSequenceAfterEsc) {
        continueFrameSequenceAfterEsc = false;
        escStageActive = false;
        void mountSelectedBattery(true);
      }
      return escReady;
    }
    escReady = Promise.all([loadComponentTemplate(path, escCache),
      loadMotionAsset().catch((error: unknown) => {
        console.warn('Aster 450 ESC motion unavailable; mounting ESCs in final positions.', error);
        return undefined;
      })]).then(([template, motion]) => {
      if (version !== escVersion || frame !== currentFrame) return;
      const esc = new THREE.Group();
      esc.name = 'SmallQuad_ESC_4in1';
      esc.visible = false;
      const visual = template.clone(true);
      visual.name = 'SelectedEscVisual_4in1';
      visual.traverse((part) => {
        if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; }
      });
      esc.add(visual);
      anchor.add(esc);
      mountedEscs = [esc];
      if (motion) {
        try {
          const prepared = prepareEscInstallation(frame, motion.animations);
          escMotion = prepared.playback;
          lastEscMotionDuration = prepared.window.duration;
        } catch (error) {
          console.warn('Aster 450 ESC clips could not bind; mounting in final positions.', error);
        }
      }
      if (escMotion) {
        revealCentralEscDuringInstall(frame);
        focusCentralEscDuringInstall(anchor);
      }
      esc.visible = true;
      if (!escMotion) {
        escStageActive = false;
        if (continueFrameSequenceAfterEsc) {
          continueFrameSequenceAfterEsc = false;
          void mountSelectedBattery(true);
        } else if (selectedBatteryId && mountedBatteries.length === 0) {
          void mountSelectedBattery();
        }
      }
    }, (error: unknown) => {
      if (version === escVersion) {
        escStageActive = false;
        console.warn(`ESC GLB "${path}" unavailable.`, error);
        if (continueFrameSequenceAfterEsc) {
          continueFrameSequenceAfterEsc = false;
          void mountSelectedBattery(true);
        } else if (selectedBatteryId && mountedBatteries.length === 0) {
          void mountSelectedBattery();
        }
      }
    });
    return escReady;
  };

  const setSelectedEsc = (escId?: string): Promise<void> => {
    selectedEscId = escId;
    return mountSelectedEsc();
  };

  const frameModel = (resetView = false): void => {
    if (!modelBounds) return;

    const center = modelBounds.getCenter(new THREE.Vector3());
    const radius = modelBounds.getBoundingSphere(new THREE.Sphere()).radius;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const fitDistance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.2;
    const distance = resetView ? fitDistance : Math.max(fitDistance, camera.position.distanceTo(controls.target));
    const direction = resetView
      ? new THREE.Vector3(4.5, 3.4, 5.5).normalize()
      : camera.position.clone().sub(controls.target).normalize();

    controls.target.copy(center);
    controls.minDistance = radius * 1.2;
    controls.maxDistance = Math.max(14, distance * 3);
    camera.near = Math.max(0.001, radius / 100);
    camera.far = Math.max(100, controls.maxDistance + radius * 2);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.updateProjectionMatrix();
    controls.update();
  };

  const replaceFrame = (model: THREE.Group, isFallback: boolean,
    frameId?: string, rotorCount?: number, motion?: GLTF): THREE.Group => {
    // Preserve the exported metric scale and materials; only translate the root.
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y += grid.position.y + 0.01 - bounds.min.y;
    model.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    });
    let preparedFrame: SelectionPlayback | undefined;
    if (!isFallback && frameId === 'frame-aster-450' && rotorCount === 4 && motion) {
      model.visible = false;
      try {
        const prepared = prepareFrameAssembly(model, motion.animations);
        preparedFrame = prepared.playback;
        lastFrameMotionDuration = prepared.window.duration;
      } catch (error) {
        console.warn('Aster 450 frame clips could not bind; displaying the assembled static frame.', error);
      }
    }
    if (currentFrame) {
      frameMotion?.cancel();
      frameMotion = undefined;
      clearMotors();
      clearEscs();
      clearBatteries();
      scene.remove(currentFrame);
      // Cached GLB clones share geometry/materials. Dispose only procedural resources.
      if (currentIsFallback) {
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        currentFrame.traverse((part) => {
          if (part instanceof THREE.Mesh) {
            geometries.add(part.geometry);
            const meshMaterials = Array.isArray(part.material) ? part.material : [part.material];
            meshMaterials.forEach((material: THREE.Material) => materials.add(material));
          }
        });
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
      }
    }
    currentFrame = model;
    currentIsFallback = isFallback;
    frameMotion = preparedFrame;
    frameAssembled = !preparedFrame;
    loadedFrameId = frameId;
    loadedRotorCount = rotorCount;
    scene.add(model);
    model.visible = true;
    modelBounds = new THREE.Box3().setFromObject(model);
    frameModel(true);
    if (frameAssembled) void mountSelectedEsc(true);
    return model;
  };

  const completeFrameSelection = (): void => {
    if (!frameMotion) return;
    frameMotion.finish();
    frameMotion = undefined;
    frameAssembled = true;
    void mountSelectedEsc(true);
  };

  const completeEscSelection = (): void => {
    if (!escMotion) return;
    escMotion.finish();
    escMotion = undefined;
    escStageActive = false;
    restoreEscPlateMaterials.forEach((restore) => restore());
    restoreEscPlateMaterials = [];
    restoreEscCamera?.();
    restoreEscCamera = undefined;
    if (continueFrameSequenceAfterEsc) {
      continueFrameSequenceAfterEsc = false;
      void mountSelectedBattery(true);
    } else if (selectedBatteryId && mountedBatteries.length === 0) {
      void mountSelectedBattery();
    }
  };

  const completeBatterySelection = (): void => {
    if (!batteryMotion) return;
    batteryMotion.finish();
    batteryMotion = undefined;
    if (continueFrameSequenceAfterBattery) {
      continueFrameSequenceAfterBattery = false;
      void mountSelectedMotor();
    }
  };

  const completeMotorSelection = (): void => {
    if (!motorMotion) return;
    motorMotion.finish();
    motorMotion = undefined;
    if (mountedMotors.length === 4) {
      motorAssembled = true;
      void mountSelectedPropeller();
    }
  };

  const completePropellerSelection = (): void => {
    propellerMotion?.finish();
    propellerMotion = undefined;
  };

  const seekSelectionAnimation = (seconds: number): void => {
    if (frameMotion) {
      frameMotion.seek(seconds);
      if (frameMotion.time >= frameMotion.duration) completeFrameSelection();
    } else if (escMotion) {
      escMotion.seek(seconds);
      if (escMotion.time >= escMotion.duration) completeEscSelection();
    } else if (batteryMotion) {
      batteryMotion.seek(seconds);
      if (batteryMotion.time >= batteryMotion.duration) completeBatterySelection();
    } else if (motorMotion) {
      motorMotion.seek(seconds);
      if (motorMotion.time >= motorMotion.duration) completeMotorSelection();
    } else if (propellerMotion) {
      propellerMotion.seek(seconds);
      if (propellerMotion.time >= propellerMotion.duration) completePropellerSelection();
    }
  };

  const exitAssembly = (): void => {
    ++assemblyVersion;
    assemblyMixer?.stopAllAction();
    if (assemblyMixer && assemblyRoot) assemblyMixer.uncacheRoot(assemblyRoot.children[0]);
    assemblyActions = [];
    assemblyMixer = undefined;
    assemblyDuration = 0;
    assemblyTime = 0;
    assemblyRoot?.removeFromParent();
    assemblyRoot = undefined;
    if (currentFrame && !currentFrame.parent) scene.add(currentFrame);
    if (currentFrame) {
      modelBounds = new THREE.Box3().setFromObject(currentFrame);
      frameModel(true);
    }
    controls.enabled = true;
    setAssemblyStatus('idle');
  };

  const restartAssembly = (): void => {
    if (!assemblyMixer || assemblyActions.length === 0) return;
    for (const action of assemblyActions) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }
    assemblyMixer.setTime(0);
    assemblyTime = 0;
    controls.enabled = false;
    setAssemblyStatus('playing');
  };

  const pauseAssembly = (): void => {
    if (assemblyStatus !== 'playing') return;
    assemblyActions.forEach((action) => { action.paused = true; });
    controls.enabled = true;
    setAssemblyStatus('paused');
  };

  const resumeAssembly = (): void => {
    if (assemblyStatus !== 'paused') return;
    assemblyActions.forEach((action) => { action.paused = false; });
    controls.enabled = false;
    setAssemblyStatus('playing');
  };

  const seekAssembly = (seconds: number): void => {
    if (!assemblyMixer || !Number.isFinite(seconds)) return;
    assemblyTime = THREE.MathUtils.clamp(seconds, 0, assemblyDuration);
    assemblyMixer.setTime(assemblyTime);
    if (assemblyTime >= assemblyDuration) {
      controls.enabled = true;
      setAssemblyStatus('complete');
    } else if (assemblyStatus === 'complete') {
      controls.enabled = true;
      setAssemblyStatus('paused');
    }
  };

  const enterAssembly = async (): Promise<boolean> => {
    const path = resolveAssemblyModel(currentFrameId, currentRotorCount);
    if (!path) return false;
    if (assemblyRoot) { restartAssembly(); return true; }
    const version = ++assemblyVersion;
    setAssemblyStatus('loading');
    completeFrameSelection();
    await escReady;
    completeEscSelection();
    await batteryReady;
    completeBatterySelection();
    await motorReady;
    completeMotorSelection();
    await propellerReady;
    completePropellerSelection();
    if (version !== assemblyVersion || !resolveAssemblyModel(currentFrameId, currentRotorCount)) return false;
    let assetReady = assemblyCache.get(path);
    if (!assetReady) {
      assetReady = loadGltfAsset(path).catch((error: unknown) => {
        assemblyCache.delete(path);
        throw error;
      });
      assemblyCache.set(path, assetReady);
    }
    try {
      const asset = await assetReady;
      if (version !== assemblyVersion || !resolveAssemblyModel(currentFrameId, currentRotorCount)) return false;
      if (asset.animations.length === 0) throw new Error('Assembly GLB has no animation clips.');
      const instance = asset.scene.clone(true);
      const wrapper = new THREE.Group();
      wrapper.name = 'Aster450_AssemblyPresentation';
      wrapper.add(instance);
      const mixer = new THREE.AnimationMixer(instance);
      const actions = asset.animations.map((clip) => mixer.clipAction(clip));
      const duration = Math.max(...asset.animations.map((clip) => clip.duration));
      // Fit the whole imported hierarchy by moving only its wrapper. Children
      // retain every Blender animation transform.
      actions.forEach((action) => action.play());
      mixer.setTime(duration);
      instance.updateMatrixWorld(true);
      const finalBounds = new THREE.Box3().setFromObject(instance);
      const center = finalBounds.getCenter(new THREE.Vector3());
      wrapper.position.set(-center.x, grid.position.y + 0.01 - finalBounds.min.y, -center.z);
      mixer.setTime(0);
      wrapper.updateMatrixWorld(true);
      const initialBounds = new THREE.Box3().setFromObject(wrapper);
      finalBounds.translate(wrapper.position);
      initialBounds.union(finalBounds);
      if (currentFrame) scene.remove(currentFrame);
      scene.add(wrapper);
      assemblyRoot = wrapper;
      assemblyMixer = mixer;
      assemblyActions = actions;
      assemblyDuration = duration;
      modelBounds = initialBounds;
      frameModel(true);
      restartAssembly();
      return true;
    } catch (error) {
      if (version !== assemblyVersion) return false;
      console.error(`Assembly GLB "${path}" could not be loaded.`, error);
      controls.enabled = true;
      setAssemblyStatus('error');
      return false;
    }
  };

  const setDroneFrame = (rotorCount: number | undefined, frameId?: string): Promise<THREE.Group | undefined> => {
    const model = resolveFrameModel(frameId, rotorCount);
    const { path } = model;
    const count = model.rotorCount ?? 4;
    if (assemblyRoot || assemblyStatus === 'loading') exitAssembly();
    currentFrameId = frameId;
    currentRotorCount = model.rotorCount;
    if (requestedModelPath === path) return modelReady;

    requestedModelPath = path;
    const version = ++requestVersion;
    ++motorVersion;
    frameMotion?.cancel();
    frameMotion = undefined;
    frameAssembled = true;
    clearMotors();
    clearEscs();
    clearBatteries();
    let templateReady = modelCache.get(path);
    if (!templateReady) {
      templateReady = loadDroneModel(path).then((template) => {
        const missing = model.anchors?.filter((name) => !template.getObjectByName(name)) ?? [];
        if (missing.length > 0) {
          console.warn(`Frame GLB "${path}" is missing attachment anchors: ${missing.join(', ')}.`);
        }
        return template;
      }).catch((error: unknown) => {
        // A failed request must not poison the cache; a later selection can retry.
        modelCache.delete(path);
        throw error;
      });
      modelCache.set(path, templateReady);
    }

    modelReady = templateReady.then(async (template) => {
      if (version !== requestVersion) return undefined;
      let motion: GLTF | undefined;
      if (frameId === 'frame-aster-450' && model.rotorCount === 4) {
        try {
          motion = await loadMotionAsset();
        } catch (error) {
          console.warn('Aster 450 assembly motion unavailable; displaying the static frame.', error);
        }
      }
      if (version !== requestVersion) return undefined;
      // Transform the instance, keeping the cached Blender template untouched.
      return replaceFrame(template.clone(true), false, frameId, model.rotorCount, motion);
    }, (error: unknown) => {
      if (version !== requestVersion) return undefined;
      console.warn(`Frame GLB "${path}" unavailable; using the ${count}-rotor procedural fallback.`, error);
      requestedModelPath = undefined;
      return replaceFrame(createDroneModel(count), true, frameId, model.rotorCount);
    });
    return modelReady;
  };

  setDroneFrame(initialRotorCount, initialFrameId);

  const resizeScene = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    frameModel();
  };

  const resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(container);
  resizeScene();

  const clock = new THREE.Clock();
  const animate = (): void => {
    const delta = Math.min(clock.getDelta(), 0.1);
    if (assemblyStatus === 'playing' && assemblyMixer) {
      assemblyMixer.update(delta);
      assemblyTime = Math.min(assemblyDuration, assemblyTime + delta);
      if (assemblyTime >= assemblyDuration) {
        assemblyMixer.setTime(assemblyDuration);
        controls.enabled = true;
        setAssemblyStatus('complete');
      }
    } else if (!assemblyRoot && assemblyStatus !== 'loading') {
      if (frameMotion && frameMotion.update(delta)) completeFrameSelection();
      if (escMotion && escMotion.update(delta)) completeEscSelection();
      if (batteryMotion && batteryMotion.update(delta)) completeBatterySelection();
      if (motorMotion && motorMotion.update(delta)) completeMotorSelection();
      if (propellerMotion && propellerMotion.update(delta)) completePropellerSelection();
    }
    controls.update();
    renderer.render(scene, camera);
  };

  renderer.setAnimationLoop(animate);

  return {
    scene, camera, renderer, controls, setDroneFrame, setSelectedEsc, setSelectedBattery, setSelectedMotor, setSelectedPropeller,
    enterAssembly, pauseAssembly, resumeAssembly, restartAssembly, seekAssembly, exitAssembly,
    seekSelectionAnimation,
    onAssemblyStatusChange(listener: (status: AssemblyStatus) => void) {
      assemblyListener = listener;
      listener(assemblyStatus);
    },
    get assemblyStatus() { return assemblyStatus; },
    get assemblyDuration() { return assemblyDuration; },
    get assemblyTime() { return assemblyTime; },
    get modelReady() { return modelReady; },
    get motorReady() { return motorReady; },
    get escReady() { return escReady; },
    get batteryReady() { return batteryReady; },
    get propellerReady() { return propellerReady; },
    get selectionAnimationPhase() { return frameMotion ? 'frame' : escMotion ? 'esc' : batteryMotion ? 'battery' : motorMotion ? 'motor' : propellerMotion ? 'propeller' : 'idle'; },
    get selectionAnimationTime() { return frameMotion?.time ?? escMotion?.time ?? batteryMotion?.time ?? motorMotion?.time ?? propellerMotion?.time ?? 0; },
    get frameSelectionDuration() { return lastFrameMotionDuration; },
    get motorSelectionDuration() { return lastMotorMotionDuration; },
    get escSelectionDuration() { return lastEscMotionDuration; },
    get batterySelectionDuration() { return lastBatteryMotionDuration; },
    get propellerSelectionDuration() { return lastPropellerMotionDuration; },
  };
}
