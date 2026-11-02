import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export async function loadGltfAsset(path: string): Promise<GLTF> {
  try {
    return await loader.loadAsync(path);
  } catch (cause) {
    throw new Error(`Failed to load drone model from "${path}".`, { cause });
  }
}

export async function loadDroneModel(path: string): Promise<Group> {
  return (await loadGltfAsset(path)).scene;
}
