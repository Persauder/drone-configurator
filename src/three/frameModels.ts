import { resolveRotorCount } from '../configurator/frameSelection';
import { frames } from '../data/frames';

interface FrameModel {
  path: string;
  anchors?: readonly string[];
}

interface FrameVariants {
  base: FrameModel;
  layouts: Readonly<Partial<Record<number, FrameModel>>>;
}

const aster450Anchors = [
  'SmallQuad_MotorMount_01',
  'SmallQuad_MotorMount_02',
  'SmallQuad_MotorMount_03',
  'SmallQuad_MotorMount_04',
  'SmallQuad_CameraMount',
  'SmallQuad_AntennaMount',
  'SmallQuad_BatteryMount',
] as const;

const genericFrames: FrameVariants = {
  base: { path: '/models/quad_frame.glb' },
  layouts: {
    4: { path: '/models/quad_frame.glb' },
    6: { path: '/models/hexa_frame.glb' },
    8: { path: '/models/octo_frame.glb' },
  },
};

const frameModels: Readonly<Record<string, FrameVariants>> = {
  'frame-aster-450': {
    base: {
      path: '/models/frames/aster-450/aster_450_base.glb',
      anchors: ['SmallQuad_CameraMount', 'SmallQuad_AntennaMount'],
    },
    layouts: {
      4: {
        path: '/models/frames/aster-450/aster_450_quad.glb',
        anchors: aster450Anchors,
      },
    },
  },
};

export function resolveFrameModel(frameId?: string, rotorCount?: number): FrameModel & { rotorCount?: number } {
  const frame = frames.find((item) => item.id === frameId);
  // Explicitly unresolved layouts stay unresolved in the viewer. UI auto-selection is separate.
  const count = frame ? resolveRotorCount(frame, rotorCount, false) : rotorCount;
  const variants = frameModels[frameId ?? ''] ?? genericFrames;
  const layout = count === undefined ? undefined : variants.layouts[count];
  return { ...(layout ?? variants.base), rotorCount: layout ? count : undefined };
}
