// Stable catalog ID for the central Aster 450 4-in-1 ESC.
const escModels: Readonly<Record<string, string>> = {
  'esc-v25': '/models/escs/small/small_esc_4in1.glb',
};

export function resolveEscModel(escId?: string): string | undefined {
  return escId ? escModels[escId] : undefined;
}
