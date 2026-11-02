// Stable catalog IDs, not labels, determine which approved small motor fits.
const motorModels: Readonly<Record<string, string>> = {
  'motor-m2216': '/models/motors/small/small_motor_open.glb',
  'motor-m2814': '/models/motors/small/small_motor_closed.glb',
};

export function resolveMotorModel(motorId?: string): string | undefined {
  return motorId ? motorModels[motorId] : undefined;
}
