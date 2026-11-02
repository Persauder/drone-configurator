import type { Battery } from '../configurator/types';

// Discharge ratings include headroom for electronics as well as motor current.
export const batteries: Battery[] = [
    { id: 'battery-b4-4000', name: 'B4 4000', weightKg: 0.4, voltage: 14.8, capacityAh: 4, maxContinuousCurrent: 110 },
    { id: 'battery-b4-6000', name: 'B4 6000', weightKg: 0.58, voltage: 14.8, capacityAh: 6, maxContinuousCurrent: 160 },
    { id: 'battery-b6-5000', name: 'B6 5000', weightKg: 0.72, voltage: 22.2, capacityAh: 5, maxContinuousCurrent: 200 },
    { id: 'battery-b6-10000', name: 'B6 10000', weightKg: 1.35, voltage: 22.2, capacityAh: 10, maxContinuousCurrent: 320 },
    { id: 'battery-b8-12000', name: 'B8 12000', weightKg: 2.05, voltage: 29.6, capacityAh: 12, maxContinuousCurrent: 400 },
    { id: 'battery-b12-16000', name: 'B12 16000', weightKg: 3.9, voltage: 44.4, capacityAh: 16, maxContinuousCurrent: 640 },
];
