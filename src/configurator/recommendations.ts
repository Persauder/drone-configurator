import { calculateBatteryEnergyWh, calculateEstimatedFlightTimeMinutes, calculateThrustToWeight, calculateTotalMass } from './calculator';
import type { DroneConfiguration } from './types';
import { validateConfiguration } from './validator';

export interface MissionRecommendation {
  level: 'info' | 'recommended' | 'warning';
  message: string;
}

const AGRICULTURE_PAYLOAD_CAPACITY_KG = 5;
const AGRICULTURE_BATTERY_ENERGY_WH = 500;
const DELIVERY_PAYLOAD_CAPACITY_KG = 3;
const DELIVERY_PAYLOAD_RESERVE_RATIO = 0.8;
const DELIVERY_MTOW_RESERVE_RATIO = 0.85;
const DELIVERY_BATTERY_ENERGY_WH = 300;
const DELIVERY_THRUST_TO_WEIGHT = 1.8;
const PROFESSIONAL_FLIGHT_TIME_MINUTES = 15;
const PROFESSIONAL_BATTERY_ENERGY_WH = 200;
const PROFESSIONAL_EQUIPMENT_IDS = ['electronics-camera', 'electronics-thermal-camera', 'electronics-lidar'];
const LEVEL_PRIORITY = { warning: 0, recommended: 1, info: 2 };

function hasBatteryIssue(issues: ReadonlySet<string>): boolean {
  return ['battery-voltage-too-low', 'battery-voltage-too-high',
    'battery-continuous-current-too-low', 'motor-esc-voltage-incompatible'].some((code) => issues.has(code));
}

function getAgricultureRecommendations(
  configuration: Readonly<DroneConfiguration>,
  issues: ReadonlySet<string>,
): MissionRecommendation[] {
  const recommendations: MissionRecommendation[] = [];
  const { frame } = configuration;

  if (frame && frame.maxPayloadKg < AGRICULTURE_PAYLOAD_CAPACITY_KG && !issues.has('frame-payload-exceeded')) {
    recommendations.push({
      level: 'recommended',
      message: 'Consider a frame with higher payload capacity for agricultural use.',
    });
  }

  if (frame?.allowedRotorCounts.some((count) => count === 6 || count === 8)
    && !issues.has('thrust-to-weight-insufficient')) {
    recommendations.push({
      level: 'info',
      message: 'Six or eight rotors can help lift heavier agricultural payloads.',
    });
  }

  const batteryEnergyWh = calculateBatteryEnergyWh(configuration);
  if (batteryEnergyWh !== undefined && batteryEnergyWh < AGRICULTURE_BATTERY_ENERGY_WH && !hasBatteryIssue(issues)) {
    recommendations.push({
      level: 'recommended',
      message: 'Consider a higher-energy battery for agricultural missions.',
    });
  }

  return recommendations;
}

function getDeliveryRecommendations(
  configuration: Readonly<DroneConfiguration>,
  issues: ReadonlySet<string>,
): MissionRecommendation[] {
  const recommendations: MissionRecommendation[] = [];
  const { frame } = configuration;

  if (frame) {
    if (frame.maxPayloadKg < DELIVERY_PAYLOAD_CAPACITY_KG && !issues.has('frame-payload-exceeded')) {
      recommendations.push({
        level: 'recommended',
        message: 'Consider a frame with higher payload capacity for delivery missions.',
      });
    }

    if (configuration.payloadKg > frame.maxPayloadKg * DELIVERY_PAYLOAD_RESERVE_RATIO
      && !issues.has('frame-payload-exceeded') && frame.maxPayloadKg >= DELIVERY_PAYLOAD_CAPACITY_KG) {
      recommendations.push({
        level: 'recommended',
        message: 'Consider more payload capacity for a larger delivery reserve.',
      });
    }

    if (calculateTotalMass(configuration) > frame.maxTakeoffWeightKg * DELIVERY_MTOW_RESERVE_RATIO
      && !issues.has('frame-mtow-exceeded')) {
      recommendations.push({
        level: 'recommended',
        message: 'Consider a higher takeoff weight limit for more delivery reserve.',
      });
    }
  }

  const batteryEnergyWh = calculateBatteryEnergyWh(configuration);
  if (batteryEnergyWh !== undefined && batteryEnergyWh < DELIVERY_BATTERY_ENERGY_WH && !hasBatteryIssue(issues)) {
    recommendations.push({
      level: 'recommended',
      message: 'Consider a higher-energy battery for delivery missions.',
    });
  }

  const thrustToWeight = calculateThrustToWeight(configuration);
  if (thrustToWeight !== undefined && thrustToWeight < DELIVERY_THRUST_TO_WEIGHT
    && !['thrust-to-weight-insufficient', 'thrust-reserve-very-low', 'thrust-reserve-moderate'].some((code) => issues.has(code))) {
    recommendations.push({
      level: 'recommended',
      message: 'A higher thrust reserve is recommended for delivery missions.',
    });
  }

  if (configuration.rotorCount === 4 && frame?.allowedRotorCounts.some((count) => count === 6 || count === 8)
    && !issues.has('thrust-to-weight-insufficient')) {
    recommendations.push({
      level: 'info',
      message: 'Six or eight rotors can help lift heavier delivery payloads.',
    });
  }

  return recommendations;
}

function getProfessionalRecommendations(
  configuration: Readonly<DroneConfiguration>,
  issues: ReadonlySet<string>,
): MissionRecommendation[] {
  const recommendations: MissionRecommendation[] = [];
  const optionalIds = new Set(configuration.electronics.filter((item) => !item.required).map((item) => item.id));

  if (!PROFESSIONAL_EQUIPMENT_IDS.some((id) => optionalIds.has(id))) {
    recommendations.push({
      level: 'recommended',
      message: 'Consider a camera, thermal camera or LiDAR for professional missions.',
    });
  }

  if (optionalIds.has('electronics-camera') && !optionalIds.has('electronics-gimbal')) {
    recommendations.push({
      level: 'recommended',
      message: 'Consider a gimbal for steadier camera images.',
    });
  }

  const batteryEnergyWh = calculateBatteryEnergyWh(configuration);
  const lowBatteryEnergy = batteryEnergyWh !== undefined && batteryEnergyWh < PROFESSIONAL_BATTERY_ENERGY_WH;
  const flightTimeMinutes = calculateEstimatedFlightTimeMinutes(configuration);
  if (flightTimeMinutes !== undefined && flightTimeMinutes < PROFESSIONAL_FLIGHT_TIME_MINUTES
    && !lowBatteryEnergy && !hasBatteryIssue(issues)) {
    recommendations.push({
      level: 'recommended',
      message: 'Consider reducing weight or power use for longer professional flights.',
    });
  }

  if (lowBatteryEnergy && !hasBatteryIssue(issues)) {
    recommendations.push({
      level: 'recommended',
      message: 'Consider a higher-energy battery for professional missions.',
    });
  }

  return recommendations;
}

export function getMissionRecommendations(
  configuration: Readonly<DroneConfiguration>,
): MissionRecommendation[] {
  // Technical messages take priority only over related advice, not the whole mission panel.
  if (configuration.mission === 'custom') return [];
  const issues = new Set(validateConfiguration(configuration).map((item) => item.code));
  let recommendations: MissionRecommendation[];
  switch (configuration.mission) {
    case 'agriculture': recommendations = getAgricultureRecommendations(configuration, issues); break;
    case 'delivery': recommendations = getDeliveryRecommendations(configuration, issues); break;
    case 'professional': recommendations = getProfessionalRecommendations(configuration, issues); break;
    default: return [];
  }
  const seen = new Set<string>();
  return recommendations.filter(({ message }) => {
    if (seen.has(message)) return false;
    seen.add(message);
    return true;
  }).sort((a, b) => LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level]);
}
