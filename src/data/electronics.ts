import type { ElectronicComponent } from '../configurator/types';

export const electronics: ElectronicComponent[] = [
    { id: 'electronics-flight-controller', name: 'Flight Controller', weightKg: 0.05, category: 'control', required: true, averagePowerW: 3, operatingVoltage: 5 },
    { id: 'electronics-gnss', name: 'GNSS Module', weightKg: 0.035, category: 'navigation', required: true, averagePowerW: 1.5, operatingVoltage: 5 },
    { id: 'electronics-rc-receiver', name: 'RC Receiver', weightKg: 0.018, category: 'communication', required: true, averagePowerW: 0.8, operatingVoltage: 5 },
    { id: 'electronics-camera', name: 'Camera', weightKg: 0.12, category: 'imaging', required: false, averagePowerW: 6, operatingVoltage: 12 },
    { id: 'electronics-thermal-camera', name: 'Thermal Camera', weightKg: 0.28, category: 'imaging', required: false, averagePowerW: 12, operatingVoltage: 12 },
    { id: 'electronics-gimbal', name: 'Gimbal', weightKg: 0.48, category: 'stabilization', required: false, averagePowerW: 18, operatingVoltage: 12 },
    { id: 'electronics-lidar', name: 'LiDAR', weightKg: 0.25, category: 'sensing', required: false, averagePowerW: 28, operatingVoltage: 24 },
];
