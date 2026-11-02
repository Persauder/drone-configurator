import type { DroneConfiguration } from './types';
import { electronics } from '../data/electronics';

export const configuration: DroneConfiguration = {
  mission: 'custom',
  frame: undefined,
  rotorCount: undefined,
  motor: undefined,
  propeller: undefined,
  esc: undefined,
  electronics: electronics.filter((component) => component.required),
  battery: undefined,
  payloadKg: 0,
};