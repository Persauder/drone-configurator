import type { DroneConfiguration, ESC } from './types';

export const BATTERY_RESERVE_RATIO = 0.20;

export interface VoltageRange {
  minVoltage: number;
  maxVoltage: number;
}

export interface CurrentPowerCalculations {
  motorAverageCurrent?: number;
  motorMaxCurrent?: number;
  electronicsPowerW: number;
  electronicsCurrent?: number;
  totalAverageCurrent?: number;
  totalMaxCurrent?: number;
  averagePowerW?: number;
}

export interface BasicPerformanceSummary {
  totalMassKg: number;
  requiredVoltageMin?: number;
  requiredVoltageMax?: number;
  averageCurrentA?: number;
  maximumCurrentA?: number;
  averagePowerW?: number;
  batteryEnergyWh?: number;
  usableBatteryEnergyWh?: number;
  estimatedFlightTimeMinutes?: number;
  totalThrustKg?: number;
  thrustToWeight?: number;
}

function validNonNegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
}

function getRotorCount(configuration: DroneConfiguration): number | undefined {
  const { rotorCount } = configuration;
  return rotorCount !== undefined && Number.isInteger(rotorCount) && rotorCount > 0
    ? rotorCount
    : undefined;
}

export function calculateEscQuantity(esc: ESC | undefined, rotorCount: number | undefined): number {
  if (!esc) return 0;
  if (esc.topology === '4in1') return 1;
  return rotorCount !== undefined && Number.isInteger(rotorCount) && rotorCount > 0 ? rotorCount : 0;
}

function calculateElectronicsPowerW(configuration: DroneConfiguration): number {
  return configuration.electronics.reduce(
    (total, component) => total + validNonNegative(component.averagePowerW),
    0,
  );
}

export function calculateTotalMass(configuration: DroneConfiguration): number {
  const rotorCount = getRotorCount(configuration) ?? 0;

  const electronicsMass = configuration.electronics.reduce(
    (total, component) => total + validNonNegative(component.weightKg),
    0,
  );

  const totalMass = validNonNegative(configuration.frame?.weightKg)
    + validNonNegative(configuration.motor?.weightKg) * rotorCount
    + validNonNegative(configuration.propeller?.weightKg) * rotorCount
    + validNonNegative(configuration.esc?.weightKg) * calculateEscQuantity(configuration.esc, getRotorCount(configuration))
    + electronicsMass
    + validNonNegative(configuration.battery?.weightKg)
    + validNonNegative(configuration.payloadKg);

  return Number.isFinite(totalMass) ? totalMass : 0;
}

export function calculateTotalThrustKg(
  configuration: DroneConfiguration,
): number | undefined {
  const motor = configuration.motor;
  const rotorCount = getRotorCount(configuration);

  if (!motor
    || rotorCount === undefined
    || !Number.isFinite(motor.maxThrustKg)
    || motor.maxThrustKg <= 0) {
    return undefined;
  }

  const totalThrustKg = motor.maxThrustKg * rotorCount;
  return Number.isFinite(totalThrustKg) && totalThrustKg > 0
    ? totalThrustKg
    : undefined;
}

export function calculateThrustToWeight(
  configuration: DroneConfiguration,
): number | undefined {
  const totalThrustKg = calculateTotalThrustKg(configuration);
  const totalMassKg = calculateTotalMass(configuration);

  if (totalThrustKg === undefined || totalMassKg <= 0) {
    return undefined;
  }

  const thrustToWeight = totalThrustKg / totalMassKg;
  return Number.isFinite(thrustToWeight) && thrustToWeight >= 0
    ? thrustToWeight
    : undefined;
}

export function calculateRequiredVoltageRange(
  configuration: DroneConfiguration,
): VoltageRange | undefined {
  const { motor, esc } = configuration;

  if (!motor || !esc) {
    return undefined;
  }

  return {
    minVoltage: Math.max(motor.minVoltage, esc.minVoltage),
    maxVoltage: Math.min(motor.maxVoltage, esc.maxVoltage),
  };
}

export function calculateCurrentAndPower(
  configuration: DroneConfiguration,
): CurrentPowerCalculations {
  const rotorCount = getRotorCount(configuration);
  const motor = configuration.motor;
  const battery = configuration.battery;
  const electronicsPowerW = calculateElectronicsPowerW(configuration);

  const motorAverageCurrent = motor && rotorCount
    ? validNonNegative(motor.averageCurrent) * rotorCount
    : undefined;
  const motorMaxCurrent = motor && rotorCount
    ? validNonNegative(motor.maxCurrent) * rotorCount
    : undefined;
  const hasValidBatteryVoltage = battery
    && Number.isFinite(battery.voltage)
    && battery.voltage > 0;
  const electronicsCurrent = hasValidBatteryVoltage
    ? electronicsPowerW / battery.voltage
    : undefined;
  const totalAverageCurrent = motorAverageCurrent !== undefined
    && electronicsCurrent !== undefined
    ? motorAverageCurrent + electronicsCurrent
    : undefined;
  const totalMaxCurrent = motorMaxCurrent !== undefined
    && electronicsCurrent !== undefined
    ? motorMaxCurrent + electronicsCurrent
    : undefined;
  const averagePowerW = totalAverageCurrent !== undefined && hasValidBatteryVoltage
    ? battery.voltage * totalAverageCurrent
    : undefined;

  return {
    motorAverageCurrent,
    motorMaxCurrent,
    electronicsPowerW,
    electronicsCurrent,
    totalAverageCurrent,
    totalMaxCurrent,
    averagePowerW,
  };
}
export function calculateEstimatedHoverPowerW(
  configuration: DroneConfiguration,
): number | undefined {
  const battery = configuration.battery;
  const motor = configuration.motor;
  const rotorCount = getRotorCount(configuration);
  const totalMassKg = calculateTotalMass(configuration);
  const totalThrustKg = calculateTotalThrustKg(configuration);

  if (!battery
    || !motor
    || rotorCount === undefined
    || !Number.isFinite(totalMassKg)
    || totalMassKg <= 0
    || totalThrustKg === undefined
    || !Number.isFinite(totalThrustKg)
    || totalThrustKg <= 0
    || !Number.isFinite(battery.voltage)
    || battery.voltage <= 0
    || !Number.isFinite(motor.maxCurrent)
    || motor.maxCurrent <= 0
    || configuration.electronics.some(
      (component) => !Number.isFinite(component.averagePowerW) || component.averagePowerW < 0,
    )) {
    return undefined;
  }

  const hoverThrustFraction = totalMassKg / totalThrustKg;

  if (hoverThrustFraction >= 1) {
    return undefined;
  }

  const maxPropulsionPowerW = battery.voltage * motor.maxCurrent * rotorCount;

  if (!Number.isFinite(maxPropulsionPowerW) || maxPropulsionPowerW <= 0) {
    return undefined;
  }

  // Approximate rotorcraft model, not a motor/propeller simulation.
  const propulsionPowerFraction = Math.pow(hoverThrustFraction, 1.5);
  const estimatedPropulsionPowerW = maxPropulsionPowerW * propulsionPowerFraction;
  const electronicsPowerW = calculateElectronicsPowerW(configuration);
  const estimatedHoverPowerW = estimatedPropulsionPowerW + electronicsPowerW;

  return Number.isFinite(estimatedHoverPowerW) && estimatedHoverPowerW > 0
    ? estimatedHoverPowerW
    : undefined;
}

export function calculateBatteryEnergyWh(
  configuration: DroneConfiguration,
): number | undefined {
  const battery = configuration.battery;

  if (!battery
    || !Number.isFinite(battery.voltage)
    || battery.voltage <= 0
    || !Number.isFinite(battery.capacityAh)
    || battery.capacityAh <= 0) {
    return undefined;
  }

  const batteryEnergyWh = battery.voltage * battery.capacityAh;
  return Number.isFinite(batteryEnergyWh) && batteryEnergyWh > 0
    ? batteryEnergyWh
    : undefined;
}
export function calculateUsableBatteryEnergyWh(
  configuration: DroneConfiguration,
): number | undefined {
  const batteryEnergyWh = calculateBatteryEnergyWh(configuration);

  if (batteryEnergyWh === undefined || batteryEnergyWh <= 0) {
    return undefined;
  }

  const usableEnergyWh = batteryEnergyWh * (1 - BATTERY_RESERVE_RATIO);
  return Number.isFinite(usableEnergyWh) && usableEnergyWh > 0
    ? usableEnergyWh
    : undefined;
}

export function calculateEstimatedFlightTimeMinutes(
  configuration: DroneConfiguration,
): number | undefined {
  const usableEnergyWh = calculateUsableBatteryEnergyWh(configuration);
  const estimatedHoverPowerW = calculateEstimatedHoverPowerW(configuration);

  if (usableEnergyWh === undefined
    || estimatedHoverPowerW === undefined
    || usableEnergyWh <= 0
    || estimatedHoverPowerW <= 0) {
    return undefined;
  }

  const flightTimeMinutes = (usableEnergyWh / estimatedHoverPowerW) * 60;
  return Number.isFinite(flightTimeMinutes) && flightTimeMinutes > 0
    ? flightTimeMinutes
    : undefined;
}

export function calculateBasicSummary(
  configuration: DroneConfiguration,
): BasicPerformanceSummary {
  const voltageRange = calculateRequiredVoltageRange(configuration);
  const currentAndPower = calculateCurrentAndPower(configuration);

  return {
    totalMassKg: calculateTotalMass(configuration),
    requiredVoltageMin: voltageRange?.minVoltage,
    requiredVoltageMax: voltageRange?.maxVoltage,
    averageCurrentA: currentAndPower.totalAverageCurrent,
    maximumCurrentA: currentAndPower.totalMaxCurrent,
    averagePowerW: calculateEstimatedHoverPowerW(configuration),
    batteryEnergyWh: calculateBatteryEnergyWh(configuration),
    usableBatteryEnergyWh: calculateUsableBatteryEnergyWh(configuration),
    estimatedFlightTimeMinutes: calculateEstimatedFlightTimeMinutes(configuration),
    totalThrustKg: calculateTotalThrustKg(configuration),
    thrustToWeight: calculateThrustToWeight(configuration),
  };
}
