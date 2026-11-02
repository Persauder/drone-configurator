export interface PropellerModelPair {
  readonly cw: string;
  readonly ccw: string;
}

const propellerModels: Readonly<Record<string, PropellerModelPair>> = {
  // The catalog's 9-inch P9045 is the approved 230 mm small-quad pair.
  'propeller-p9045': {
    cw: '/models/propellers/small/small_propeller_cw.glb',
    ccw: '/models/propellers/small/small_propeller_ccw.glb',
  },
};

export const PROPELLER_CAP_PATH = '/models/propellers/small/small_prop_retaining_cap.glb';

// These motor numbers were verified against the approved Blender anchors:
// 01 lower left, 02 lower right, 03 upper right, 04 upper left.
export const ASTER_PROPELLER_HANDEDNESS = ['cw', 'ccw', 'cw', 'ccw'] as const;

export function resolvePropellerModel(propellerId?: string): PropellerModelPair | undefined {
  return propellerId ? propellerModels[propellerId] : undefined;
}
