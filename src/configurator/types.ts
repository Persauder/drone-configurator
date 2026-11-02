export type MissionType =
    | 'agriculture'
    | 'delivery'
    | 'professional'
    | 'custom';

// Dataset units: mass in kg, voltage in V, current in A, capacity in Ah,
// power in W, and propeller dimensions in inches. Calculated energy is in Wh.
export interface DroneComponent {
    id: string;
    name: string;
    weightKg: number;
}

export interface Frame extends DroneComponent {
    allowedRotorCounts: number[];
    maxPayloadKg: number;
    maxTakeoffWeightKg: number;
    maxPropellerDiameterInch: number;
}

export interface Motor extends DroneComponent {
    minVoltage: number;
    maxVoltage: number;
    averageCurrent: number;
    maxCurrent: number;
    // Per-motor thrust in kgf (kg-equivalent lift), not newtons.
    maxThrustKg: number;
}

export interface Propeller extends DroneComponent {
    diameterInch: number;
    pitchInch: number;
}

export interface ESC extends DroneComponent {
    // Individual units are mounted once per rotor. A 4-in-1 is one physical module.
    topology: 'individual' | '4in1';
    minVoltage: number;
    maxVoltage: number;
    // Current ratings are per motor channel for both topologies.
    continuousCurrent: number;
    peakCurrent: number;
}

export interface ElectronicComponent extends DroneComponent {
    category: string;
    required: boolean;
    averagePowerW: number;
    operatingVoltage: number;
}

export interface Battery extends DroneComponent {
    voltage: number;
    capacityAh: number;
    maxContinuousCurrent: number;
}

export interface DroneConfiguration {
    mission: MissionType;

    frame?: Frame;

    rotorCount?: number;
    motor?: Motor;
    propeller?: Propeller;
    esc?: ESC;

    electronics: ElectronicComponent[];

    battery?: Battery;

    payloadKg: number;
}
