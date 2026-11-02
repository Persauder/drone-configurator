import type { ESC } from '../configurator/types';

export const escs: ESC[] = [
    { id: 'esc-v25', name: 'V25 4-in-1', topology: '4in1', weightKg: 0.025, minVoltage: 9, maxVoltage: 16.8, continuousCurrent: 25, peakCurrent: 35 },
    { id: 'esc-v40', name: 'V40', topology: 'individual', weightKg: 0.04, minVoltage: 11.1, maxVoltage: 25.2, continuousCurrent: 40, peakCurrent: 55 },
    { id: 'esc-v55', name: 'V55', topology: 'individual', weightKg: 0.055, minVoltage: 11.1, maxVoltage: 33.6, continuousCurrent: 55, peakCurrent: 70 },
    { id: 'esc-v70', name: 'V70', topology: 'individual', weightKg: 0.08, minVoltage: 14.8, maxVoltage: 50.4, continuousCurrent: 70, peakCurrent: 90 },
    { id: 'esc-v90', name: 'V90', topology: 'individual', weightKg: 0.115, minVoltage: 18.5, maxVoltage: 50.4, continuousCurrent: 90, peakCurrent: 120 },
    { id: 'esc-v110', name: 'V110', topology: 'individual', weightKg: 0.16, minVoltage: 22.2, maxVoltage: 50.4, continuousCurrent: 110, peakCurrent: 140 },
];
