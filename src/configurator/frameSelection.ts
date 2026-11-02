import type { Frame } from './types';

/** Resolve layout compatibility from the selected frame's dataset entry. */
export function resolveRotorCount(
  frame: Frame | undefined,
  requested: number | undefined,
  autoSelectSingle = true,
): number | undefined {
  if (!frame) return undefined;
  if (requested !== undefined && frame.allowedRotorCounts.includes(requested)) return requested;
  return autoSelectSingle && frame.allowedRotorCounts.length === 1
    ? frame.allowedRotorCounts[0]
    : undefined;
}
