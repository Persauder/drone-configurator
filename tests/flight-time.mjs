import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Bundle TypeScript in memory using the build tool already installed with Vite.
const bundle = await build({
  stdin: {
    contents: `
      export * from './src/configurator/calculator';
      export * from './src/data/frames';
      export * from './src/data/motors';
      export * from './src/data/propellers';
      export * from './src/data/escs';
      export * from './src/data/batteries';
      export * from './src/data/electronics';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const base = {
  mission: 'custom',
  frame: api.frames[1],
  rotorCount: 4,
  motor: api.motors[3],
  propeller: api.propellers[3],
  esc: api.escs[1],
  battery: api.batteries[3],
  electronics: api.electronics.filter((item) => item.required),
  payloadKg: 0,
};
function measure(configuration) {
  const summary = api.calculateBasicSummary(configuration);
  const power = api.calculateEstimatedHoverPowerW(configuration);
  assert.equal(summary.averagePowerW, power);
  assert.ok(Number.isFinite(power) && power > 0);
  assert.equal(summary.estimatedFlightTimeMinutes, api.calculateUsableBatteryEnergyWh(configuration) / power * 60);
  return {
    mass: summary.totalMassKg,
    ratio: summary.thrustToWeight,
    power,
    minutes: summary.estimatedFlightTimeMinutes,
  };
}
function assertHeavier(before, after) {
  assert.ok(after.mass > before.mass);
  assert.ok(after.ratio < before.ratio);
  assert.ok(after.power > before.power);
  assert.ok(after.minutes < before.minutes);
}
const payloadResults = [0, 1, 2].map((payloadKg) => measure({ ...base, payloadKg }));
assertHeavier(payloadResults[0], payloadResults[1]);
assertHeavier(payloadResults[1], payloadResults[2]);

const heavierBattery = { ...base, battery: { ...base.battery, weightKg: base.battery.weightKg + 1 } };
assert.equal(api.calculateUsableBatteryEnergyWh(heavierBattery), api.calculateUsableBatteryEnergyWh(base));
const heavierResult = measure(heavierBattery);
assertHeavier(payloadResults[0], heavierResult);

const accessoryResults = {};
for (const name of ['Camera', 'LiDAR']) {
  const accessory = api.electronics.find((item) => item.name === name);
  assert.ok(accessory);
  const configuration = { ...base, electronics: [...base.electronics, accessory] };
  const result = measure(configuration);
  assertHeavier(payloadResults[0], result);
  assert.equal(api.calculateCurrentAndPower(configuration).electronicsPowerW,
    api.calculateCurrentAndPower(base).electronicsPowerW + accessory.averagePowerW);
  const withoutAccessoryPower = { ...configuration, electronics: [...base.electronics, { ...accessory, averagePowerW: 0 }] };
  assert.ok(Math.abs(result.power - api.calculateEstimatedHoverPowerW(withoutAccessoryPower) - accessory.averagePowerW) < 1e-9);
  accessoryResults[name] = result;
}

// Independent numeric example: 4 kg / 8 kg thrust, 1000 W maximum propulsion, 10 W electronics.
const numeric = {
  ...base, frame: undefined, propeller: undefined, esc: undefined, payloadKg: 2,
  motor: { ...base.motor, weightKg: 0.25, maxThrustKg: 2, maxCurrent: 25 },
  battery: { ...base.battery, weightKg: 1, voltage: 10, capacityAh: 10 },
  electronics: [{ ...base.electronics[0], weightKg: 0, averagePowerW: 10 }],
};
assert.ok(Math.abs(api.calculateEstimatedHoverPowerW(numeric) - 363.5533905932738) < 1e-9);
assert.ok(Math.abs(api.calculateEstimatedFlightTimeMinutes(numeric) - (80 / 363.5533905932738 * 60)) < 1e-9);

function assertUnavailable(configuration) {
  assert.equal(api.calculateEstimatedHoverPowerW(configuration), undefined);
  assert.equal(api.calculateEstimatedFlightTimeMinutes(configuration), undefined);
  assert.equal(api.calculateBasicSummary(configuration).averagePowerW, undefined);
}
for (const payloadKg of [6, 7]) assertUnavailable({ ...numeric, payloadKg });
for (const key of ['battery', 'motor', 'rotorCount']) assertUnavailable({ ...base, [key]: undefined });
for (const value of [0, -1, NaN, Infinity]) {
  assertUnavailable({ ...base, battery: { ...base.battery, voltage: value } });
  assertUnavailable({ ...base, motor: { ...base.motor, maxCurrent: value } });
  assertUnavailable({ ...base, motor: { ...base.motor, maxThrustKg: value } });
  assertUnavailable({ ...base, rotorCount: value });
}
for (const value of [-1, NaN, Infinity, Number.MAX_VALUE]) {
  assertUnavailable({ ...base, electronics: [
    { ...base.electronics[0], averagePowerW: value },
    { ...base.electronics[0], averagePowerW: value },
  ] });
}
assertUnavailable({ ...base, battery: { ...base.battery, voltage: Number.MAX_VALUE } });
assertUnavailable({ ...numeric, payloadKg: 0, motor: { ...numeric.motor, weightKg: 0 }, battery: { ...numeric.battery, weightKg: 0 } });
console.table({ 'Payload 0 kg': payloadResults[0], 'Payload 1 kg': payloadResults[1], 'Payload 2 kg': payloadResults[2], 'Battery +1 kg': heavierResult, ...accessoryResults });
console.log('Passed: payload, battery mass, accessories, numeric formula, Summary consistency, thrust/weight <= 1, missing and invalid inputs.');
