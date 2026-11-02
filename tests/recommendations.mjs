import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      'configurator/recommendations', 'configurator/calculator', 'configurator/validator',
      'data/frames', 'data/motors', 'data/propellers', 'data/escs', 'data/batteries', 'data/electronics',
    ].map((path) => `export * from './src/${path}';`).join('\n'),
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const complete = {
  frame: api.frames[1], rotorCount: 4, motor: api.motors[3], propeller: api.propellers[3],
  esc: api.escs[1], battery: api.batteries[3], electronics: api.electronics.filter((item) => item.required), payloadKg: 0,
};
const empty = { mission: 'agriculture', electronics: [], payloadKg: 0 };
const frameAdvice = {
  level: 'recommended', message: 'Consider a frame with higher payload capacity for agricultural use.',
};
const batteryAdvice = {
  level: 'recommended', message: 'Consider a higher-energy battery for agricultural missions.',
};
const rotorInfo = {
  level: 'info', message: 'Six or eight rotors can help lift heavier agricultural payloads.',
};
const professionalAdvice = {
  equipment: { level: 'recommended', message: 'Consider a camera, thermal camera or LiDAR for professional missions.' },
  gimbal: { level: 'recommended', message: 'Consider a gimbal for steadier camera images.' },
  endurance: { level: 'recommended', message: 'Consider reducing weight or power use for longer professional flights.' },
  battery: { level: 'recommended', message: 'Consider a higher-energy battery for professional missions.' },
};

test('agriculture: small payload frame recommends higher capacity', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...empty, frame: api.frames[0] }), [frameAdvice]);
});

test('agriculture: low battery energy recommends higher energy', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...empty, battery: api.batteries[0] }), [batteryAdvice]);
});

test('agriculture: suitable dataset frame and battery have no capacity recommendations', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...empty, frame: api.frames[2], battery: api.batteries[5] }), [rotorInfo]);
});

test('agriculture: 5 kg and 500 Wh boundaries are inclusive; use total, not usable energy', () => {
  for (const [maxPayloadKg, expected] of [[4.99, [frameAdvice]], [5, []]]) {
    assert.deepEqual(api.getMissionRecommendations({ ...empty, frame: { ...api.frames[0], maxPayloadKg } }), expected);
  }
  for (const [capacityAh, expected] of [[24.99, [batteryAdvice]], [25, []], [30, []]]) {
    assert.deepEqual(api.getMissionRecommendations({ ...empty,
      battery: { ...api.batteries[0], voltage: 20, capacityAh },
    }), expected);
  }
});

test('agriculture: higher rotor counts are informational and four rotors remain allowed', () => {
  for (const rotorCount of [undefined, 4, 6, 8]) {
    assert.deepEqual(api.getMissionRecommendations({ ...empty, frame: api.frames[2], rotorCount }), [rotorInfo]);
  }
});

test('agriculture: missing components produce no advice; no duplicate GNSS or absent RTK advice', () => {
  assert.deepEqual(api.getMissionRecommendations(empty), []);
  assert.deepEqual(api.getMissionRecommendations({ ...empty, electronics: api.electronics }), []);
});

for (const mission of ['delivery', 'professional', 'custom']) {
  test(`${mission}: agriculture recommendations disappear`, () => {
    const configuration = { ...empty, frame: api.frames[0], battery: api.batteries[0] };
    assert.deepEqual(api.getMissionRecommendations(configuration), [frameAdvice, batteryAdvice]);
    configuration.mission = mission;
    const recommendations = api.getMissionRecommendations(configuration);
    if (mission === 'delivery') {
      assert.equal(recommendations.length, 2);
      assert.ok(recommendations.every((item) => item.message.includes('delivery missions')));
    } else if (mission === 'professional') {
      assert.deepEqual(recommendations, [professionalAdvice.equipment, professionalAdvice.battery]);
    } else {
      assert.deepEqual(recommendations, []);
    }
  });
}

const deliveryEmpty = { ...empty, mission: 'delivery' };
const deliveryAdvice = {
  frame: { level: 'recommended', message: 'Consider a frame with higher payload capacity for delivery missions.' },
  payload: { level: 'recommended', message: 'Consider more payload capacity for a larger delivery reserve.' },
  mtow: { level: 'recommended', message: 'Consider a higher takeoff weight limit for more delivery reserve.' },
  battery: { level: 'recommended', message: 'Consider a higher-energy battery for delivery missions.' },
  thrust: { level: 'recommended', message: 'A higher thrust reserve is recommended for delivery missions.' },
  rotors: { level: 'info', message: 'Six or eight rotors can help lift heavier delivery payloads.' },
};

test('delivery: reserve advice stops beyond each technical limit, including equality boundaries', () => {
  const frame = { ...api.frames[1], weightKg: 1, maxPayloadKg: 10, maxTakeoffWeightKg: 100 };
  for (const [payloadKg, expected] of [[8, []], [8.01, [deliveryAdvice.payload]], [10, [deliveryAdvice.payload]], [10.01, []]]) {
    const configuration = { ...deliveryEmpty, frame, payloadKg };
    assert.deepEqual(api.getMissionRecommendations(configuration), expected);
    assert.equal(api.validateConfiguration(configuration).some((item) => item.code === 'frame-payload-exceeded'), payloadKg > 10);
  }
  const mtowFrame = { ...frame, maxTakeoffWeightKg: 20 };
  for (const [payloadKg, expected] of [[16, []], [16.01, [deliveryAdvice.mtow]], [19, [deliveryAdvice.mtow]], [19.01, []]]) {
    const configuration = { ...deliveryEmpty, frame: mtowFrame, payloadKg };
    assert.deepEqual(api.getMissionRecommendations(configuration), expected);
    assert.equal(api.validateConfiguration(configuration).some((item) => item.code === 'frame-mtow-exceeded'), payloadKg > 19);
  }
});

test('delivery: low frame capacity replaces similar payload reserve advice', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty, frame: api.frames[0], payloadKg: 0.9 }), [deliveryAdvice.frame]);
  assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty, frame: api.frames[0], payloadKg: 1.01 }), []);
});

test('related errors suppress weaker advice while unrelated recommendations remain', () => {
  for (const mission of ['agriculture', 'delivery']) {
    const configuration = { ...complete, mission, frame: api.frames[0], payloadKg: 2 };
    const messages = api.getMissionRecommendations(configuration).map((item) => item.message);
    assert.ok(api.validateConfiguration(configuration).some((item) => item.code === 'frame-payload-exceeded'));
    assert.ok(!messages.includes(frameAdvice.message) && !messages.includes(deliveryAdvice.frame.message));
    assert.ok(messages.includes(mission === 'agriculture' ? batteryAdvice.message : deliveryAdvice.battery.message));
  }
  // Oversized propellers and weak ESCs do not suppress unrelated payload/energy suggestions.
  for (const patch of [{ propeller: api.propellers[5] }, { esc: { ...complete.esc, continuousCurrent: 1 } }]) {
    const configuration = { ...complete, mission: 'agriculture', ...patch };
    assert.ok(api.validateConfiguration(configuration).some((item) => item.level === 'error'));
    assert.deepEqual(api.getMissionRecommendations(configuration), [frameAdvice, batteryAdvice, rotorInfo]);
  }
});

for (const mission of ['agriculture', 'delivery', 'professional']) {
  test(`${mission}: battery safety errors suppress energy/endurance advice`, () => {
    for (const [patch, code] of [
      [{ battery: { ...complete.battery, voltage: 10, capacityAh: 1 } }, 'battery-voltage-too-low'],
      [{ battery: { ...complete.battery, voltage: 50, capacityAh: 1 } }, 'battery-voltage-too-high'],
      [{ battery: { ...complete.battery, capacityAh: 1, maxContinuousCurrent: 1 } }, 'battery-continuous-current-too-low'],
      [{ motor: api.motors[6], esc: api.escs[0], battery: { ...complete.battery, capacityAh: 1 } }, 'motor-esc-voltage-incompatible'],
    ]) {
      const configuration = { ...complete, mission, ...patch };
      assert.ok(api.validateConfiguration(configuration).some((item) => item.code === code));
      const advice = api.getMissionRecommendations(configuration);
      assert.ok(advice.every((item) => !item.message.includes('battery') && item.message !== professionalAdvice.endurance.message));
    }
  });
}

test('professional: low energy gives one actionable suggestion; sufficient energy keeps endurance advice', () => {
  const configuration = { ...complete, mission: 'professional', battery: api.batteries[2] };
  assert.deepEqual(api.validateConfiguration(configuration), []);
  assert.ok(api.calculateEstimatedFlightTimeMinutes(configuration) < 15);
  assert.deepEqual(api.getMissionRecommendations(configuration), [professionalAdvice.equipment, professionalAdvice.battery]);
  assert.deepEqual(api.getMissionRecommendations({ ...configuration, battery: complete.battery }),
    [professionalAdvice.equipment, professionalAdvice.endurance]);
});

test('recommendations are unique, deterministic and ordered for all missions and partial selections', () => {
  const priority = { warning: 0, recommended: 1, info: 2 };
  const keys = ['frame', 'rotorCount', 'motor', 'propeller', 'esc', 'battery'];
  for (const mission of ['agriculture', 'delivery', 'professional', 'custom']) {
    for (let mask = 0; mask < 2 ** keys.length; mask++) {
      const configuration = { mission, electronics: [...api.electronics, ...api.electronics], payloadKg: 0 };
      keys.forEach((key, index) => { if (mask & (1 << index)) configuration[key] = complete[key]; });
      const before = structuredClone(configuration);
      const validation = api.validateConfiguration(configuration);
      const summary = api.calculateBasicSummary(configuration);
      const advice = api.getMissionRecommendations(configuration);
      assert.equal(new Set(advice.map((item) => item.message)).size, advice.length);
      assert.deepEqual(advice, api.getMissionRecommendations(configuration));
      assert.deepEqual(advice.map((item) => priority[item.level]), advice.map((item) => priority[item.level]).sort());
      assert.deepEqual(configuration, before);
      assert.deepEqual(api.validateConfiguration(configuration), validation);
      assert.deepEqual(api.calculateBasicSummary(configuration), summary);
      if (mission === 'custom') assert.deepEqual(advice, []);
    }
  }
  assert.deepEqual(api.getMissionRecommendations({ ...complete, mission: 'agriculture' }), [frameAdvice, batteryAdvice, rotorInfo]);
});

test('delivery: frame payload capacity below 3 kg recommends a larger frame', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty, frame: api.frames[0] }), [deliveryAdvice.frame]);
  assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty, frame: api.frames[1] }), []);
});

test('delivery: payload reserve triggers only above 80 percent of the frame limit', () => {
  const frame = { ...api.frames[2], maxPayloadKg: 10 };
  for (const [payloadKg, expected] of [[0, []], [7.99, []], [8, []], [8.01, [deliveryAdvice.payload]]]) {
    assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty, frame, payloadKg }), expected);
  }
});

test('delivery: calculated total mass triggers MTOW advice only above 85 percent', () => {
  const frame = { ...api.frames[0], weightKg: 1, maxPayloadKg: 100, maxTakeoffWeightKg: 20 };
  const configuration = { ...deliveryEmpty, frame, payloadKg: 15,
    battery: { ...api.batteries[5], weightKg: 1 },
  };
  assert.equal(api.calculateTotalMass(configuration), 17);
  assert.deepEqual(api.getMissionRecommendations(configuration), []);
  assert.deepEqual(api.getMissionRecommendations({ ...configuration, payloadKg: 14.99 }), []);
  assert.deepEqual(api.getMissionRecommendations({ ...configuration,
    electronics: [{ ...api.electronics[0], weightKg: 0.01 }],
  }), [deliveryAdvice.mtow]);
});

test('delivery: battery threshold is 300 Wh total energy', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty, battery: api.batteries[0] }), [deliveryAdvice.battery]);
  for (const [capacityAh, expected] of [[14.99, [deliveryAdvice.battery]], [15, []], [16, []]]) {
    assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty,
      battery: { ...api.batteries[0], voltage: 20, capacityAh },
    }), expected);
  }
});

test('delivery: thrust advice below 1.8 only when validator has no thrust message', () => {
  for (const ratio of [0.99, 1, 1.6, 1.799, 1.8, 2]) {
    // Four motors weighing 1 kg each: maxThrustKg equals the resulting T/W.
    const configuration = { ...deliveryEmpty, rotorCount: 4,
      motor: { ...api.motors[3], weightKg: 1, maxThrustKg: ratio },
    };
    assert.equal(api.calculateThrustToWeight(configuration), ratio);
    assert.deepEqual(api.getMissionRecommendations(configuration), ratio >= 1.6 && ratio < 1.8 ? [deliveryAdvice.thrust] : []);
    if (ratio >= 1.6) assert.deepEqual(api.validateConfiguration(configuration), []);
  }
});

test('delivery: rotor info requires four selected rotors and a six/eight-capable frame', () => {
  for (const allowedRotorCounts of [[4], [4, 6], [4, 8]]) {
    for (const rotorCount of [undefined, 4, 6, 8]) {
      const configuration = { ...deliveryEmpty, frame: { ...api.frames[2], allowedRotorCounts }, rotorCount };
      assert.deepEqual(api.getMissionRecommendations(configuration),
        rotorCount === 4 && allowedRotorCounts.length > 1 ? [deliveryAdvice.rotors] : []);
    }
  }
});

test('delivery: suitable complete configuration has no recommendations', () => {
  const configuration = { ...deliveryEmpty, frame: api.frames[2], rotorCount: 6,
    motor: api.motors[5], propeller: api.propellers[3], esc: api.escs[3], battery: api.batteries[5],
    electronics: api.electronics.filter((item) => item.required), payloadKg: 1,
  };
  assert.deepEqual(api.validateConfiguration(configuration), []);
  assert.deepEqual(api.getMissionRecommendations(configuration), []);
});

test('delivery: unavailable frame, battery and thrust inputs do not invent recommendations', () => {
  for (const patch of [{}, { payloadKg: 10 }, { rotorCount: 4 }, { motor: api.motors[0] }]) {
    assert.deepEqual(api.getMissionRecommendations({ ...deliveryEmpty, ...patch }), []);
  }
});

for (const mission of ['agriculture', 'professional', 'custom']) {
  test(`${mission}: delivery recommendations are removed on mission change`, () => {
    const configuration = { ...deliveryEmpty, frame: api.frames[0], battery: api.batteries[0] };
    assert.deepEqual(api.getMissionRecommendations(configuration), [deliveryAdvice.frame, deliveryAdvice.battery]);
    configuration.mission = mission;
    const expected = mission === 'agriculture' ? [frameAdvice, batteryAdvice]
      : mission === 'professional' ? [professionalAdvice.equipment, professionalAdvice.battery] : [];
    assert.deepEqual(api.getMissionRecommendations(configuration), expected);
  });
}

for (const [payloadKg, levels] of [[0, []], [2, ['warning']], [4, ['error', 'error', 'warning']]]) {
  test(`delivery advice leaves state, calculations and validator unchanged at ${payloadKg} kg payload`, () => {
    const configuration = { ...deliveryEmpty, frame: api.frames[1], rotorCount: 4,
      motor: api.motors[3], propeller: api.propellers[3], esc: api.escs[1], battery: api.batteries[3],
      electronics: api.electronics.filter((item) => item.required), payloadKg,
    };
    const before = structuredClone(configuration);
    const validation = api.validateConfiguration(configuration);
    const summary = api.calculateBasicSummary(configuration);
    assert.deepEqual(validation.map((item) => item.level), levels);
    assert.ok(api.getMissionRecommendations(configuration).length > 0);
    assert.deepEqual(configuration, before);
    assert.deepEqual(api.validateConfiguration(configuration), validation);
    assert.deepEqual(api.calculateBasicSummary(configuration), summary);
    assert.deepEqual(api.validateConfiguration({ ...configuration, mission: 'custom' }), validation);
  });
}

const professionalEmpty = { ...empty, mission: 'professional' };
const camera = api.electronics.find((item) => item.id === 'electronics-camera');
const gimbal = api.electronics.find((item) => item.id === 'electronics-gimbal');
assert.ok(camera && gimbal);

test('professional: no mission equipment, required electronics or gimbal alone recommend equipment', () => {
  for (const electronics of [[], api.electronics.filter((item) => item.required), [gimbal]]) {
    assert.deepEqual(api.getMissionRecommendations({ ...professionalEmpty, electronics }), [professionalAdvice.equipment]);
  }
});

for (const id of ['electronics-camera', 'electronics-thermal-camera', 'electronics-lidar']) {
  test(`professional: ${id} is recognized by ID after renaming`, () => {
    const item = api.electronics.find((item) => item.id === id);
    assert.ok(item);
    assert.deepEqual(api.getMissionRecommendations({ ...professionalEmpty, electronics: [{ ...item, name: 'Renamed sensor' }] }),
      id === camera.id ? [professionalAdvice.gimbal] : []);
  });
}

test('professional: display name alone does not identify mission equipment', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...professionalEmpty,
    electronics: [{ ...gimbal, name: 'Camera' }],
  }), [professionalAdvice.equipment]);
});

test('professional: Camera with Gimbal removes stabilization advice', () => {
  assert.deepEqual(api.getMissionRecommendations({ ...professionalEmpty, electronics: [camera] }), [professionalAdvice.gimbal]);
  assert.deepEqual(api.getMissionRecommendations({ ...professionalEmpty,
    electronics: [camera, { ...gimbal, name: 'Renamed stabilizer' }],
  }), []);
});

test('professional: flight time below 15 minutes recommends endurance; exactly 15 does not', () => {
  // 4 kg / 16 kgf, 800 W hover power, 250 Wh total / 200 Wh usable gives exactly 15 minutes.
  const configuration = { ...professionalEmpty, rotorCount: 4, payloadKg: 2,
    motor: { ...api.motors[3], weightKg: 0.25, maxThrustKg: 4, maxCurrent: 80 },
    battery: { ...api.batteries[3], weightKg: 1, voltage: 20, capacityAh: 12.5 },
  };
  assert.equal(api.calculateEstimatedFlightTimeMinutes(configuration), 15);
  for (const capacityAh of [12.49, 12.5, 12.51]) {
    assert.deepEqual(api.getMissionRecommendations({ ...configuration, battery: { ...configuration.battery, capacityAh } }),
      capacityAh < 12.5 ? [professionalAdvice.equipment, professionalAdvice.endurance] : [professionalAdvice.equipment]);
  }
  const insufficientThrust = { ...configuration, payloadKg: 14 };
  assert.equal(api.calculateEstimatedFlightTimeMinutes(insufficientThrust), undefined);
  assert.deepEqual(api.getMissionRecommendations(insufficientThrust), [professionalAdvice.equipment]);
});

test('professional: battery energy below 200 Wh recommends energy; exactly 200 does not', () => {
  for (const [capacityAh, expected] of [[9.99, [professionalAdvice.battery]], [10, []], [11, []]]) {
    assert.deepEqual(api.getMissionRecommendations({ ...professionalEmpty, electronics: [camera, gimbal],
      battery: { ...api.batteries[0], voltage: 20, capacityAh },
    }), expected);
  }
});

test('professional: suitable complete dataset configuration has no recommendations', () => {
  const configuration = { ...professionalEmpty, frame: api.frames[1], rotorCount: 4,
    motor: api.motors[6], propeller: api.propellers[0], esc: api.escs[4], battery: api.batteries[4],
    electronics: api.electronics.filter((item) => item.required || item.id === 'electronics-lidar'),
  };
  assert.deepEqual(api.validateConfiguration(configuration), []);
  assert.ok(api.calculateEstimatedFlightTimeMinutes(configuration) >= 15);
  assert.deepEqual(api.getMissionRecommendations(configuration), []);
});

for (const mission of ['agriculture', 'delivery', 'custom']) {
  test(`${mission}: professional recommendations disappear`, () => {
    const configuration = { ...professionalEmpty, frame: api.frames[0], battery: api.batteries[0], electronics: [camera] };
    assert.deepEqual(api.getMissionRecommendations(configuration), [professionalAdvice.gimbal, professionalAdvice.battery]);
    configuration.mission = mission;
    const expected = mission === 'agriculture' ? [frameAdvice, batteryAdvice]
      : mission === 'delivery' ? [deliveryAdvice.frame, deliveryAdvice.battery] : [];
    assert.deepEqual(api.getMissionRecommendations(configuration), expected);
  });
}

for (const [payloadKg, levels] of [[0, []], [2, ['warning']], [4, ['error', 'error', 'warning']]]) {
  test(`professional advice preserves state, calculations and validation at ${payloadKg} kg payload`, () => {
    const configuration = { ...professionalEmpty, frame: api.frames[1], rotorCount: 4,
      motor: api.motors[3], propeller: api.propellers[3], esc: api.escs[1], battery: api.batteries[3],
      electronics: api.electronics.filter((item) => item.required), payloadKg,
    };
    const before = structuredClone(configuration);
    const validation = api.validateConfiguration(configuration);
    const summary = api.calculateBasicSummary(configuration);
    assert.deepEqual(validation.map((item) => item.level), levels);
    assert.deepEqual(api.getMissionRecommendations(configuration), [professionalAdvice.equipment, professionalAdvice.endurance]);
    assert.deepEqual(configuration, before);
    assert.deepEqual(api.validateConfiguration(configuration), validation);
    assert.deepEqual(api.calculateBasicSummary(configuration), summary);
    assert.deepEqual(api.validateConfiguration({ ...configuration, mission: 'custom' }), validation);
  });
}

for (const [payloadKg, expectedLevels] of [[0, []], [2, ['warning']], [4, ['error', 'error', 'warning']]]) {
  test(`recommendations preserve configuration, calculations and validation at ${payloadKg} kg payload`, () => {
    const configuration = { ...empty, frame: api.frames[1], rotorCount: 4,
      motor: api.motors[3], propeller: api.propellers[3], esc: api.escs[1], battery: api.batteries[3],
      electronics: api.electronics.filter((item) => item.required), payloadKg,
    };
    const before = structuredClone(configuration);
    const validation = api.validateConfiguration(configuration);
    const summary = api.calculateBasicSummary(configuration);
    assert.deepEqual(validation.map((item) => item.level), expectedLevels);
    assert.deepEqual(api.getMissionRecommendations(configuration),
      payloadKg > configuration.frame.maxPayloadKg ? [batteryAdvice, rotorInfo] : [frameAdvice, batteryAdvice, rotorInfo]);
    assert.deepEqual(configuration, before);
    assert.deepEqual(api.validateConfiguration(configuration), validation);
    assert.deepEqual(api.calculateBasicSummary(configuration), summary);
    assert.deepEqual(api.validateConfiguration({ ...configuration, mission: 'custom' }), validation);
  });
}
