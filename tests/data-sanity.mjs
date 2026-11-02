import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const categories = ['frames', 'motors', 'propellers', 'escs', 'batteries', 'electronics'];
const bundle = await build({
  stdin: {
    contents: categories.map((name) => `export { ${name} } from './src/data/${name}';`).join('\n'),
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function finiteNumbers(value, path) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path}: expected a finite number`);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) finiteNumbers(child, `${path}.${key}`);
  }
}

function checkComponent(category, item) {
  const context = `${category}/${item.id}`;
  const check = (condition, message) => assert.ok(condition, `${context}: ${message}`);
  const positive = (...fields) => {
    for (const field of fields) {
      check(Number.isFinite(item[field]) && item[field] > 0, `${field} must be finite and > 0`);
    }
  };
  const nonNegative = (...fields) => {
    for (const field of fields) {
      check(Number.isFinite(item[field]) && item[field] >= 0, `${field} must be finite and >= 0`);
    }
  };
  check(typeof item.id === 'string' && item.id.trim().length > 0, 'id must not be empty');
  check(typeof item.name === 'string' && item.name.trim().length > 0, 'name must not be empty');
  finiteNumbers(item, context);
  if (category === 'electronics') nonNegative('weightKg');
  else positive('weightKg');

  switch (category) {
    case 'frames':
      nonNegative('maxPayloadKg');
      positive('maxTakeoffWeightKg', 'maxPropellerDiameterInch');
      check(item.maxTakeoffWeightKg > item.weightKg, 'maxTakeoffWeightKg must exceed frame weightKg');
      check(Array.isArray(item.allowedRotorCounts) && item.allowedRotorCounts.length > 0,
        'allowedRotorCounts must be a non-empty array');
      for (const count of item.allowedRotorCounts) {
        check(Number.isInteger(count) && count > 0, 'rotor counts must be positive integers');
      }
      break;
    case 'motors':
      positive('minVoltage', 'maxVoltage', 'averageCurrent', 'maxCurrent', 'maxThrustKg');
      check(item.maxVoltage >= item.minVoltage, 'maxVoltage must be >= minVoltage');
      check(item.maxCurrent >= item.averageCurrent, 'maxCurrent must be >= averageCurrent');
      break;
    case 'propellers':
      positive('diameterInch', 'pitchInch');
      break;
    case 'escs':
      positive('minVoltage', 'maxVoltage', 'continuousCurrent', 'peakCurrent');
      check(item.topology === 'individual' || item.topology === '4in1', 'topology must describe physical ESC layout');
      check(item.maxVoltage >= item.minVoltage, 'maxVoltage must be >= minVoltage');
      check(item.peakCurrent >= item.continuousCurrent, 'peakCurrent must be >= continuousCurrent');
      break;
    case 'batteries':
      positive('voltage', 'capacityAh', 'maxContinuousCurrent');
      break;
    case 'electronics':
      nonNegative('averagePowerW');
      positive('operatingVoltage');
      check(typeof item.category === 'string' && item.category.trim().length > 0, 'category must not be empty');
      check(typeof item.required === 'boolean', 'required must be boolean');
      break;
    default:
      assert.fail(`Unknown dataset category: ${category}`);
  }
}

function checkDataset(category, items) {
  assert.ok(Array.isArray(items) && items.length > 0, `${category}: expected a non-empty dataset`);
  const ids = new Set();
  for (const item of items) {
    checkComponent(category, item);
    assert.ok(!ids.has(item.id), `${category}: duplicate id ${item.id}`);
    ids.add(item.id);
  }
}

for (const category of categories) {
  test(`${category}: dataset sanity (${data[category].length} components)`, () => {
    checkDataset(category, data[category]);
  });
}

// Mutate copies only: verify that malformed data actually trips the checks.
test('sanity rejects invalid numeric fields in every category', () => {
  for (const category of categories) {
    const item = data[category][0];
    for (const [field, original] of Object.entries(item)) {
      if (typeof original !== 'number') continue;
      for (const value of [-1, NaN, Infinity, -Infinity, undefined, null, '1']) {
        assert.throws(() => checkComponent(category, { ...item, [field]: value }),
          assert.AssertionError, `${category}.${field} must reject ${String(value)}`);
      }
      const allowsZero = field === 'maxPayloadKg'
        || (category === 'electronics' && ['weightKg', 'averagePowerW'].includes(field));
      const checkZero = () => checkComponent(category, { ...item, [field]: 0 });
      if (allowsZero) assert.doesNotThrow(checkZero);
      else assert.throws(checkZero, assert.AssertionError, `${category}.${field} must reject zero`);
    }
  }
});

test('sanity rejects invalid identities and non-finite nested values', () => {
  for (const category of categories) {
    const item = data[category][0];
    for (const field of ['id', 'name']) {
      for (const value of ['', '   ', undefined, 123]) {
        assert.throws(() => checkComponent(category, { ...item, [field]: value }), assert.AssertionError);
      }
    }
    assert.throws(() => checkDataset(category, [item, { ...item }]), /duplicate id/);
    assert.throws(() => checkDataset(category, []), /non-empty dataset/);
    for (const value of [NaN, Infinity, -Infinity]) {
      assert.throws(() => checkComponent(category, { ...item, extra: { values: [value] } }),
        /expected a finite number/);
    }
  }
});

test('sanity enforces ordered limits and positive integer rotor counts', () => {
  const frame = data.frames[0];
  for (const maxTakeoffWeightKg of [frame.weightKg, frame.weightKg / 2]) {
    assert.throws(() => checkComponent('frames', { ...frame, maxTakeoffWeightKg }),
      /must exceed frame weightKg/);
  }
  for (const allowedRotorCounts of [[], undefined, '4', [0], [-1], [1.5], ['4'], [NaN], [Infinity], new Array(1)]) {
    assert.throws(() => checkComponent('frames', { ...frame, allowedRotorCounts }), assert.AssertionError);
  }
  assert.doesNotThrow(() => checkComponent('frames', { ...frame, allowedRotorCounts: [1, 3, 5] }));

  for (const [category, lower, upper] of [
    ['motors', 'minVoltage', 'maxVoltage'],
    ['motors', 'averageCurrent', 'maxCurrent'],
    ['escs', 'minVoltage', 'maxVoltage'],
    ['escs', 'continuousCurrent', 'peakCurrent'],
  ]) {
    const item = data[category][0];
    assert.throws(() => checkComponent(category, { ...item, [upper]: item[lower] / 2 }),
      assert.AssertionError, `${category}.${upper} must be >= ${lower}`);
    assert.doesNotThrow(() => checkComponent(category, { ...item, [upper]: item[lower] }));
  }
});
