import type { Motor } from '../configurator/types';

// Voltage ranges overlap; current, mass and thrust distinguish the choices.
export const motors: Motor[] = [
    { id: 'motor-m2216', name: 'M2216 880KV', weightKg: 0.075, minVoltage: 11.1, maxVoltage: 16.8, averageCurrent: 6, maxCurrent: 18, maxThrustKg: 0.85 },
    { id: 'motor-m2814', name: 'M2814 700KV', weightKg: 0.105, minVoltage: 11.1, maxVoltage: 25.2, averageCurrent: 9, maxCurrent: 25, maxThrustKg: 1.3 },
    { id: 'motor-m3110', name: 'M3110 650KV', weightKg: 0.13, minVoltage: 14.8, maxVoltage: 25.2, averageCurrent: 11, maxCurrent: 32, maxThrustKg: 1.7 },
    { id: 'motor-m3508', name: 'M3508 580KV', weightKg: 0.17, minVoltage: 14.8, maxVoltage: 25.2, averageCurrent: 13, maxCurrent: 38, maxThrustKg: 2.2 },
    { id: 'motor-m4012', name: 'M4012 400KV', weightKg: 0.26, minVoltage: 18.5, maxVoltage: 33.6, averageCurrent: 17, maxCurrent: 48, maxThrustKg: 3.2 },
    { id: 'motor-m5010', name: 'M5010 320KV', weightKg: 0.35, minVoltage: 22.2, maxVoltage: 50.4, averageCurrent: 20, maxCurrent: 60, maxThrustKg: 4.5 },
    { id: 'motor-m6215', name: 'M6215 170KV', weightKg: 0.58, minVoltage: 29.6, maxVoltage: 50.4, averageCurrent: 26, maxCurrent: 75, maxThrustKg: 6.5 },
];
