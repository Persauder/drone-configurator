import type { Frame } from '../configurator/types';

export const frames: Frame[] = [
    { id: 'frame-aster-450', name: 'Aster 450', weightKg: 0.45, allowedRotorCounts: [4], maxPayloadKg: 1, maxTakeoffWeightKg: 3.2, maxPropellerDiameterInch: 12 },
    { id: 'frame-aster-680', name: 'Aster 680', weightKg: 1.2, allowedRotorCounts: [4, 6], maxPayloadKg: 3, maxTakeoffWeightKg: 7.5, maxPropellerDiameterInch: 18 },
    { id: 'frame-aster-960', name: 'Aster 960', weightKg: 2.8, allowedRotorCounts: [4, 6, 8], maxPayloadKg: 8, maxTakeoffWeightKg: 18, maxPropellerDiameterInch: 24 },
];
