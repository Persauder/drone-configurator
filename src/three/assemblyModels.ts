export const ASTER_450_ASSEMBLY_PATH = '/models/animations/aster-450/aster450_full_assembly.glb';

export function resolveAssemblyModel(frameId?: string, rotorCount?: number): string | undefined {
  return frameId === 'frame-aster-450' && rotorCount === 4
    ? ASTER_450_ASSEMBLY_PATH
    : undefined;
}
