import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      'configurator/calculator', 'configurator/validator', 'configurator/configuration',
      'data/frames', 'data/motors', 'data/propellers', 'data/escs', 'data/batteries', 'data/electronics',
    ].map((path) => `export * from './src/${path}';`).join('\n'),
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const base = {
  mission: 'custom', frame: api.frames[1], rotorCount: 4,
  motor: api.motors[3], propeller: api.propellers[3], esc: api.escs[1],
  battery: api.batteries[3], electronics: api.electronics.filter((item) => item.required), payloadKg: 0,
};

test('complete dataset configuration is valid', () => {
  assert.deepEqual(api.validateConfiguration(base), []);
  assert.ok(api.calculateBasicSummary(base).estimatedFlightTimeMinutes > 0);
});

for (const [name, validate, patch, code] of [
  ['payload exceeds frame limit', api.validateFrameLimits,
    { payloadKg: 3.01 }, 'frame-payload-exceeded'],
  ['MTOW exceeded', api.validateFrameLimits,
    { frame: { ...base.frame, maxTakeoffWeightKg: 3.67 } }, 'frame-mtow-exceeded'],
  ['propeller too large', api.validateFrameLimits,
    { propeller: api.propellers[5] }, 'frame-propeller-diameter-exceeded'],
  ['incompatible motor/ESC voltage', api.validateVoltageRequirements,
    { motor: api.motors[6], esc: api.escs[0] }, 'motor-esc-voltage-incompatible'],
  ['battery voltage too low', api.validateVoltageRequirements,
    { motor: api.motors[6], esc: api.escs[3] }, 'battery-voltage-too-low'],
  ['battery voltage too high', api.validateVoltageRequirements,
    { battery: api.batteries[4] }, 'battery-voltage-too-high'],
  ['ESC current too low', api.validateCurrentRequirements,
    { esc: api.escs[0] }, 'esc-continuous-current-too-low'],
  ['battery max current too low', api.validateCurrentRequirements,
    { battery: api.batteries[0] }, 'battery-continuous-current-too-low'],
]) {
  test(name, () => {
    const configuration = { ...base, ...patch };
    const messages = validate(configuration);
    assert.deepEqual(messages.map(({ code, level }) => ({ code, level })), [{ code, level: 'error' }]);
    assert.ok(messages[0].message.trim().length > 0);
    assert.ok(api.validateConfiguration(configuration).some((item) => item.code === code && item.level === 'error'));
  });
}

test('frame, voltage and current limits accept equality', () => {
  assert.deepEqual(api.validateFrameLimits({ ...base, payloadKg: base.frame.maxPayloadKg }), []);
  assert.deepEqual(api.validateFrameLimits({ ...base,
    frame: { ...base.frame, maxTakeoffWeightKg: api.calculateTotalMass(base),
      maxPropellerDiameterInch: base.propeller.diameterInch },
  }), []);
  for (const voltage of [base.motor.minVoltage, base.motor.maxVoltage]) {
    assert.deepEqual(api.validateVoltageRequirements({ ...base, battery: { ...base.battery, voltage } }), []);
  }
  assert.deepEqual(api.validateCurrentRequirements({ ...base,
    esc: { ...base.esc, continuousCurrent: base.motor.maxCurrent },
    battery: { ...base.battery, maxContinuousCurrent: api.calculateCurrentAndPower(base).totalMaxCurrent },
  }), []);
});

// Exactly 4 kg total mass and four motors make maxThrustKg equal to T/W.
for (const [ratio, level, code] of [
  [0.99, 'error', 'thrust-to-weight-insufficient'],
  [1, 'warning', 'thrust-reserve-very-low'],
  [1.299, 'warning', 'thrust-reserve-very-low'],
  [1.3, 'warning', 'thrust-reserve-moderate'],
  [1.599, 'warning', 'thrust-reserve-moderate'],
  [1.6, undefined, undefined],
  [2, undefined, undefined],
]) {
  test(`thrust/weight ${ratio}: ${level ?? 'valid'}`, () => {
    const configuration = { ...base, frame: undefined, propeller: undefined, esc: undefined,
      motor: { ...base.motor, weightKg: 0.25, maxThrustKg: ratio },
      battery: { ...base.battery, weightKg: 1 }, electronics: [], payloadKg: 2,
    };
    assert.equal(api.calculateThrustToWeight(configuration), ratio);
    assert.deepEqual(api.validateConfiguration(configuration).map(({ code, level }) => ({ code, level })),
      code ? [{ code, level }] : []);
  });
}

test('empty and every partial selection calculate and validate without mutation or crashes', () => {
  const keys = ['frame', 'rotorCount', 'motor', 'propeller', 'esc', 'battery'];
  for (let mask = 0; mask < 2 ** keys.length; mask++) {
    const configuration = { mission: 'custom', electronics: [], payloadKg: 0 };
    keys.forEach((key, index) => { if (mask & (1 << index)) configuration[key] = base[key]; });
    const before = structuredClone(configuration);
    const summary = api.calculateBasicSummary(configuration);
    assert.ok(Number.isFinite(summary.totalMassKg));
    for (const value of Object.values(summary)) assert.ok(value === undefined || Number.isFinite(value));
    assert.ok(Array.isArray(api.validateConfiguration(configuration)));
    assert.deepEqual(configuration, before);
  }
  assert.deepEqual(api.validateConfiguration(api.configuration), []);
  assert.equal(api.calculateBasicSummary(api.configuration).estimatedFlightTimeMinutes, undefined);
});
