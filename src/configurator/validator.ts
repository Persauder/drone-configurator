import { calculateCurrentAndPower, calculateRequiredVoltageRange, calculateThrustToWeight, calculateTotalMass } from './calculator';
import type { DroneConfiguration } from './types';

export type ValidationLevel = 'valid' | 'warning' | 'error';

export interface ValidationMessage {
  level: ValidationLevel;
  code: string;
  message: string;
}

export function validateFrameLimits(
  configuration: DroneConfiguration,
): ValidationMessage[] {
  const frame = configuration.frame;

  if (!frame) {
    return [];
  }

  const messages: ValidationMessage[] = [];

  if (configuration.payloadKg > frame.maxPayloadKg) {
    messages.push({
      level: 'error',
      code: 'frame-payload-exceeded',
      message: `Payload exceeds frame limit (${configuration.payloadKg.toFixed(2)} kg / ${frame.maxPayloadKg.toFixed(2)} kg).`,
    });
  }

  const propeller = configuration.propeller;

  if (propeller && propeller.diameterInch > frame.maxPropellerDiameterInch) {
    messages.push({
      level: 'error',
      code: 'frame-propeller-diameter-exceeded',
      message: `Selected propeller is too large for this frame (${propeller.diameterInch}" selected, maximum ${frame.maxPropellerDiameterInch}").`,
    });
  }

  const totalMass = calculateTotalMass(configuration);

  if (totalMass > frame.maxTakeoffWeightKg) {
    messages.push({
      level: 'error',
      code: 'frame-mtow-exceeded',
      message: `Maximum takeoff weight exceeded (${totalMass.toFixed(2)} kg / ${frame.maxTakeoffWeightKg.toFixed(2)} kg).`,
    });
  }

  return messages;
}

export function validateVoltageRequirements(
  configuration: DroneConfiguration,
): ValidationMessage[] {
  const voltageRange = calculateRequiredVoltageRange(configuration);

  if (!voltageRange) {
    return [];
  }

  if (voltageRange.minVoltage > voltageRange.maxVoltage) {
    return [{
      level: 'error',
      code: 'motor-esc-voltage-incompatible',
      message: 'Motor and ESC voltage ranges are incompatible.',
    }];
  }

  const battery = configuration.battery;

  if (!battery) {
    return [];
  }

  if (battery.voltage < voltageRange.minVoltage) {
    return [{
      level: 'error',
      code: 'battery-voltage-too-low',
      message: `Battery voltage is too low (${battery.voltage.toFixed(1)} V, required minimum ${voltageRange.minVoltage.toFixed(1)} V).`,
    }];
  }

  if (battery.voltage > voltageRange.maxVoltage) {
    return [{
      level: 'error',
      code: 'battery-voltage-too-high',
      message: `Battery voltage is too high (${battery.voltage.toFixed(1)} V, allowed maximum ${voltageRange.maxVoltage.toFixed(1)} V).`,
    }];
  }

  return [];
}

export function validateCurrentRequirements(
  configuration: DroneConfiguration,
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const { motor, esc, battery } = configuration;

  if (motor && esc && motor.maxCurrent > esc.continuousCurrent) {
    messages.push({
      level: 'error',
      code: 'esc-continuous-current-too-low',
      message: `ESC continuous current is too low (${motor.maxCurrent.toFixed(1)} A required, ${esc.continuousCurrent.toFixed(1)} A available).`,
    });
  }

  const { totalMaxCurrent } = calculateCurrentAndPower(configuration);

  if (battery && totalMaxCurrent !== undefined
    && totalMaxCurrent > battery.maxContinuousCurrent) {
    messages.push({
      level: 'error',
      code: 'battery-continuous-current-too-low',
      message: `Battery maximum continuous current is too low (${totalMaxCurrent.toFixed(1)} A required, ${battery.maxContinuousCurrent.toFixed(1)} A available).`,
    });
  }

  return messages;
}

export function validateThrustToWeight(
  configuration: DroneConfiguration,
): ValidationMessage[] {
  const ratio = calculateThrustToWeight(configuration);

  if (ratio === undefined) {
    return [];
  }

  // Working assumptions; these thresholds may be revised later.
  if (ratio < 1.0) {
    return [{
      level: 'error',
      code: 'thrust-to-weight-insufficient',
      message: `Insufficient thrust-to-weight ratio (${ratio.toFixed(2)}). The drone does not have enough maximum thrust for its total mass.`,
    }];
  }

  if (ratio < 1.3) {
    return [{
      level: 'warning',
      code: 'thrust-reserve-very-low',
      message: `Very low thrust reserve (${ratio.toFixed(2)}). The drone may have insufficient control and climb performance.`,
    }];
  }

  if (ratio < 1.6) {
    return [{
      level: 'warning',
      code: 'thrust-reserve-moderate',
      message: `Moderate thrust reserve (${ratio.toFixed(2)}). Higher thrust reserve is recommended.`,
    }];
  }

  return [];
}

export function validateConfiguration(
  configuration: DroneConfiguration,
): ValidationMessage[] {
  return [
    ...validateFrameLimits(configuration),
    ...validateVoltageRequirements(configuration),
    ...validateCurrentRequirements(configuration),
    ...validateThrustToWeight(configuration),
  ];
}
