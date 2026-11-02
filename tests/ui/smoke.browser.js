const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const completed = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
}
const element = (id) => document.getElementById(id);
const text = (id) => element(id).textContent;
function select(id, value) {
  const control = element(id);
  control.value = String(value);
  check(control.value === String(value), `${id}: option ${value} exists`);
  control.dispatchEvent(new Event('change', { bubbles: true }));
}
function payload(value) {
  element('payload').value = String(value);
  element('payload').dispatchEvent(new Event('input', { bubbles: true }));
}
function status(expected) {
  check(text('validation-status') === expected, `status should be ${expected}`);
  for (const state of ['valid', 'warning', 'invalid']) {
    check(element('status-dot').classList.contains(state) === (state === expected.toLowerCase()),
      `status dot ${state}`);
  }
}

try {
  const { droneView } = await import('/src/main.ts');
  const { configuration } = await import('/src/configurator/configuration.ts');
  const { frames } = await import('/src/data/frames.ts');
  const { motors } = await import('/src/data/motors.ts');
  const { propellers } = await import('/src/data/propellers.ts');
  const { escs } = await import('/src/data/escs.ts');
  const { batteries } = await import('/src/data/batteries.ts');
  const { electronics } = await import('/src/data/electronics.ts');
  check(configuration.mission === 'custom', 'default mission state is custom');
  check(element('mission').value === 'custom', 'default mission selection is Custom');
  check(text('mission-summary') === 'Custom', 'default mission Summary is Custom');
  check(element('mission-recommendations').hidden, 'Custom initially hides recommendations');
  const missions = [
    ['agriculture', 'Agriculture'], ['delivery', 'Delivery'],
    ['professional', 'Professional'], ['custom', 'Custom'],
  ];
  check(element('mission').options.length === missions.length, 'exactly four mission choices');
  function checkMissionChanges() {
    const componentState = () => JSON.stringify(Object.fromEntries(
      Object.entries(configuration).filter(([key]) => key !== 'mission'),
    ));
    const summaryState = () => JSON.stringify([
      ...[...document.querySelectorAll('.parameter dd:not(#mission-summary)')].map((item) => item.textContent),
      element('validation-messages').innerHTML, element('status-dot').className,
    ]);
    const beforeComponents = componentState();
    const beforeSummary = summaryState();
    const canvas = document.querySelector('#three-container canvas');
    for (const [value, label] of missions) {
      select('mission', value);
      check(configuration.mission === value, `${label}: mission stored correctly`);
      check(element('mission').selectedOptions[0].textContent === label, `${label}: option label`);
      check(text('mission-summary') === label, `${label}: Summary updated`);
      check(componentState() === beforeComponents, `${label}: components and payload unchanged`);
      check(summaryState() === beforeSummary, `${label}: calculations and validation unchanged`);
      const advice = [...element('mission-recommendations-list').children];
      check(new Set(advice.map((item) => item.textContent)).size === advice.length, `${label}: unique advice`);
      const priority = { warning: 0, recommended: 1, info: 2 };
      check(advice.every((item, index) => index === 0
        || priority[advice[index - 1].dataset.level] <= priority[item.dataset.level]), `${label}: ordered advice`);
      if (value === 'custom') check(advice.length === 0 && element('mission-recommendations').hidden, 'Custom clears and hides advice');
      check(document.querySelector('#three-container canvas') === canvas, `${label}: canvas retained`);
    }
  }
  checkMissionChanges();
  completed.push('default Custom and all four mission values with empty configuration');
  check(document.querySelector('#three-container canvas'), 'app initializes its canvas');
  check(element('rotor-count').disabled, 'rotor count initially disabled');
  check(text('estimated-flight-time') === '--', 'empty selection has no flight time');
  status('Valid');
  const required = electronics.filter((item) => item.required);
  check(element('required-electronics-list').children.length === required.length, 'required electronics count');
  for (const item of required) check(text('required-electronics-list').includes(item.name), item.name);
  check(configuration.electronics.length === required.length, 'required electronics in state');
  completed.push('initial/partial state and required electronics');

  for (const [id, items] of [['frame', frames], ['motor', motors], ['propeller', propellers], ['esc', escs], ['battery', batteries]]) {
    check(element(id).options.length === items.length + 1, `${id}: all dataset choices present`);
    for (const item of items) {
      select(id, item.id);
      check(configuration[id]?.id === item.id, `${id}: selection updates state`);
    }
    select(id, '');
    check(configuration[id] === undefined, `${id}: placeholder clears state`);
  }
  for (const frame of frames) {
    select('frame', frame.id);
    check(!element('rotor-count').disabled, 'rotor count enabled for frame');
    const expectedCount = frame.allowedRotorCounts.length === 1 ? frame.allowedRotorCounts[0] : undefined;
    check(configuration.rotorCount === expectedCount
      && element('rotor-count').value === (expectedCount === undefined ? '' : String(expectedCount)),
    'frame resets layout or automatically resolves its sole allowed rotor count');
    const counts = [...element('rotor-count').options].slice(1).map((option) => Number(option.value));
    check(JSON.stringify(counts) === JSON.stringify(frame.allowedRotorCounts), 'frame-specific rotor counts');
    for (const count of counts) {
      select('rotor-count', count);
      check(configuration.rotorCount === count, 'rotor selection updates state');
    }
  }
  select('frame', '');
  check(element('rotor-count').disabled && configuration.rotorCount === undefined, 'clearing frame resets rotor count');
  completed.push('all selects, every option, frame-dependent rotor counts');

  select('frame', 'frame-aster-680');
  select('rotor-count', 4);
  select('motor', 'motor-m3508');
  select('propeller', 'propeller-p1555');
  select('esc', 'esc-v40');
  select('battery', 'battery-b6-10000');
  status('Valid');
  check(element('validation-messages').children.length === 0, 'valid configuration has no messages');
  check(text('total-mass') === '3.67 kg', 'known valid configuration mass');
  check(text('thrust-performance') === 'High', 'high performance label');
  const baseMass = text('total-mass');
  const basePower = text('average-power');
  const baseTime = parseFloat(text('estimated-flight-time'));
  check(baseTime > 0, 'valid configuration has flight time');
  completed.push('valid configuration and Summary');

  const checkboxes = [...document.querySelectorAll('input[name="optional-electronics"]')];
  check(checkboxes.length === electronics.length - required.length, 'all optional electronics present');
  for (const checkbox of checkboxes) {
    checkbox.click();
    check(configuration.electronics.some((item) => item.id === checkbox.value), 'optional electronics added');
    check(parseFloat(text('total-mass')) > parseFloat(baseMass), 'optional electronics increase mass');
    check(text('average-power') !== basePower, 'optional electronics change power');
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    check(configuration.electronics.filter((item) => item.id === checkbox.value).length === 1, 'no duplicate electronics');
    checkbox.click();
    check(!configuration.electronics.some((item) => item.id === checkbox.value), 'optional electronics removed');
    check(text('total-mass') === baseMass && text('average-power') === basePower, 'Summary restored on removal');
    check(required.every((item) => configuration.electronics.includes(item)), 'required electronics retained');
  }
  completed.push('every optional electronics toggle and removal');

  checkboxes[0].click();
  payload(1000);
  checkMissionChanges();
  select('mission', 'delivery');
  payload(2000);
  check(configuration.mission === 'delivery' && text('mission-summary') === 'Delivery',
    'mission persists when other controls update Summary');
  checkMissionChanges();
  checkboxes[0].click();
  completed.push('mission preserves selected components, optional electronics, payload and Summary');

  payload(1000);
  check(configuration.payloadKg === 1, 'payload grams converted to kg');
  check(text('total-mass') === '4.67 kg', 'payload increases displayed mass');
  check(parseFloat(text('estimated-flight-time')) < baseTime, 'payload decreases flight time');
  check(text('thrust-performance') === 'Good', 'good performance label');
  payload(2000);
  status('Warning');
  check(text('thrust-performance') === 'Moderate', 'moderate performance label');
  check(document.querySelector('#validation-messages .warning'), 'warning message shown');
  select('motor', 'motor-m3110');
  status('Warning');
  check(text('thrust-performance') === 'Very low', 'very low performance label');
  select('motor', 'motor-m3508');
  payload(4000);
  status('Invalid');
  check(text('validation-messages').includes('Payload exceeds frame limit'), 'payload error shown');
  check(document.querySelector('#validation-messages .error') && document.querySelector('#validation-messages .warning'),
    'Invalid takes priority when errors and warnings coexist');
  payload(6000);
  status('Invalid');
  check(text('estimated-flight-time') === '--', 'insufficient thrust hides flight time');
  check(text('thrust-performance') === 'Insufficient', 'insufficient performance label');
  payload(-1);
  check(configuration.payloadKg === 0 && element('payload').value === '0', 'negative payload reset');
  payload('');
  check(configuration.payloadKg === 0, 'empty payload handled');
  status('Valid');
  check(element('validation-messages').children.length === 0, 'stale messages removed');
  completed.push('payload, performance labels, Valid/Warning/Invalid, message priority and reset');

  const frameAdvice = 'Consider a frame with higher payload capacity for agricultural use.';
  const batteryAdvice = 'Consider a higher-energy battery for agricultural missions.';
  const recommendationItems = () => [...element('mission-recommendations-list').children].map((item) => item.textContent);
  const selectOptions = () => JSON.stringify([...document.querySelectorAll('select')].map((control) => ({
    id: control.id, disabled: control.disabled,
    options: [...control.options].map((option) => [option.value, option.textContent, option.disabled, option.hidden]),
  })));
  const beforeOptions = selectOptions();
  for (const [grams, expectedStatus] of [[0, 'Valid'], [2000, 'Warning'], [4000, 'Invalid']]) {
    payload(grams);
    status(expectedStatus);
    checkMissionChanges();
    select('mission', 'agriculture');
    check(!element('mission-recommendations').hidden, 'Agriculture shows advice');
    check(getComputedStyle(element('mission-recommendations')).display !== 'none', 'recommendations visibly rendered');
    check(recommendationItems().includes(frameAdvice) === (grams <= 3000), 'frame advice yields to payload error');
    check(recommendationItems().includes(batteryAdvice), 'battery advice shown');
    check(!text('validation-messages').includes(frameAdvice) && !text('validation-messages').includes(batteryAdvice),
      'advice is separate from validation messages');
    status(expectedStatus);
    for (const mission of ['delivery', 'professional', 'custom']) {
      select('mission', 'agriculture');
      select('mission', mission);
      check(!recommendationItems().includes(frameAdvice) && !recommendationItems().includes(batteryAdvice),
        `${mission}: agriculture advice cleared`);
      if (mission !== 'custom') {
        check(!element('mission-recommendations').hidden, `${mission} shows its own advice`);
      } else {
        check(element('mission-recommendations').hidden && recommendationItems().length === 0, `${mission}: advice cleared`);
        check(getComputedStyle(element('mission-recommendations')).display === 'none', `${mission}: panel invisible`);
      }
      status(expectedStatus);
    }
    check(selectOptions() === beforeOptions, 'recommendations never remove or disable component choices');
  }

  payload(0);
  select('mission', 'agriculture');
  select('battery', 'battery-b12-16000');
  check(!recommendationItems().includes(batteryAdvice) && recommendationItems().includes(frameAdvice),
    'higher-energy battery removes only battery advice');
  select('frame', 'frame-aster-960');
  check(!recommendationItems().includes(frameAdvice), 'higher-payload frame removes frame advice');
  check(element('mission-recommendations-list').children.length === 1
    && element('mission-recommendations-list').firstElementChild.dataset.level === 'info',
    'suitable frame and battery retain only optional rotor information');
  select('frame', '');
  check(element('mission-recommendations').hidden, 'panel hidden when there are no recommendations');
  select('battery', 'battery-b4-4000');
  check(!element('mission-recommendations').hidden && recommendationItems().includes(batteryAdvice),
    'battery change refreshes agriculture advice');
  select('battery', '');
  check(element('mission-recommendations').hidden && recommendationItems().length === 0,
    'clearing components removes stale advice');
  completed.push('Agriculture advice refreshes independently and preserves Valid/Warning/Invalid and select options');

  const deliveryAdvice = {
    frame: 'Consider a frame with higher payload capacity for delivery missions.',
    payload: 'Consider more payload capacity for a larger delivery reserve.',
    mtow: 'Consider a higher takeoff weight limit for more delivery reserve.',
    battery: 'Consider a higher-energy battery for delivery missions.',
    thrust: 'A higher thrust reserve is recommended for delivery missions.',
    rotors: 'Six or eight rotors can help lift heavier delivery payloads.',
  };
  select('mission', 'custom');
  select('frame', 'frame-aster-680');
  select('rotor-count', 4);
  select('battery', 'battery-b6-10000');
  const deliveryOptions = selectOptions();
  for (const [grams, expectedStatus] of [[0, 'Valid'], [2000, 'Warning'], [4000, 'Invalid']]) {
    payload(grams);
    checkMissionChanges();
    select('mission', 'delivery');
    status(expectedStatus);
    check(!element('mission-recommendations').hidden, 'Delivery uses the existing recommendation panel');
    check(recommendationItems().includes(deliveryAdvice.battery), 'Delivery battery advice shown');
    check(recommendationItems().includes(deliveryAdvice.rotors), 'Delivery rotor info shown');
    check(!recommendationItems().includes(deliveryAdvice.thrust), 'thrust advice yields to validator warning');
    check(!recommendationItems().includes(deliveryAdvice.payload), 'payload reserve advice yields to exceeded limit');
    check(!recommendationItems().includes(deliveryAdvice.mtow), 'MTOW reserve advice yields to exceeded limit');
    check(!recommendationItems().includes(frameAdvice) && !recommendationItems().includes(batteryAdvice),
      'Agriculture rules do not run for Delivery');
    check(Object.values(deliveryAdvice).every((message) => !text('validation-messages').includes(message)),
      'Delivery advice is separate from validation');
    check(selectOptions() === deliveryOptions, 'Delivery preserves all select options');
    for (const mission of ['agriculture', 'professional', 'custom']) {
      select('mission', mission);
      check(Object.values(deliveryAdvice).every((message) => !recommendationItems().includes(message)),
        `${mission}: Delivery advice removed`);
      if (mission === 'custom') check(element('mission-recommendations').hidden, `${mission}: panel hidden`);
      status(expectedStatus);
    }
  }

  select('mission', 'delivery');
  payload(2900);
  status('Warning');
  check(recommendationItems().includes(deliveryAdvice.payload) && recommendationItems().includes(deliveryAdvice.mtow),
    'Delivery reserve advice shown before technical limits are exceeded');
  payload(4000);
  status('Invalid');
  check(!recommendationItems().includes(deliveryAdvice.payload) && !recommendationItems().includes(deliveryAdvice.mtow),
    'Delivery reserve advice removed after technical limits are exceeded');
  payload(6000);
  status('Invalid');
  check(!recommendationItems().includes(deliveryAdvice.thrust) && !recommendationItems().includes(deliveryAdvice.rotors),
    'insufficient thrust suppresses weaker thrust/lifting advice');
  payload(0);
  select('frame', 'frame-aster-450');
  check(recommendationItems().includes(deliveryAdvice.frame), 'Delivery low-payload frame advice shown');
  select('frame', 'frame-aster-960');
  select('rotor-count', 6);
  select('motor', 'motor-m5010');
  select('esc', 'esc-v70');
  select('battery', 'battery-b12-16000');
  payload(1000);
  status('Valid');
  check(recommendationItems().length === 0 && element('mission-recommendations').hidden,
    'suitable Delivery configuration has no recommendations');
  select('rotor-count', 4);
  check(recommendationItems().includes(deliveryAdvice.rotors), 'four rotors remain selectable and show optional info');
  select('rotor-count', 6);
  check(element('mission-recommendations').hidden, 'rotor advice removed after selecting six');
  completed.push('Delivery recommendations update, remain isolated from Agriculture and preserve state/options/status');

  const professionalAdvice = {
    equipment: 'Consider a camera, thermal camera or LiDAR for professional missions.',
    gimbal: 'Consider a gimbal for steadier camera images.',
    endurance: 'Consider reducing weight or power use for longer professional flights.',
    battery: 'Consider a higher-energy battery for professional missions.',
  };
  select('mission', 'custom');
  select('frame', 'frame-aster-680');
  select('rotor-count', 4);
  select('motor', 'motor-m3508');
  select('esc', 'esc-v40');
  select('battery', 'battery-b6-10000');
  const professionalOptions = selectOptions();
  for (const [grams, expectedStatus] of [[0, 'Valid'], [2000, 'Warning'], [4000, 'Invalid']]) {
    payload(grams);
    checkMissionChanges();
    select('mission', 'professional');
    status(expectedStatus);
    check(!element('mission-recommendations').hidden, 'Professional uses existing advice panel');
    check(recommendationItems().includes(professionalAdvice.equipment), 'Professional mission equipment advice shown');
    check(recommendationItems().includes(professionalAdvice.endurance), 'Professional endurance advice shown');
    check(recommendationItems().every((message) => Object.values(professionalAdvice).includes(message)),
      'Agriculture and Delivery rules do not run for Professional');
    check(Object.values(professionalAdvice).every((message) => !text('validation-messages').includes(message)),
      'Professional advice is separate from validation');
    check(selectOptions() === professionalOptions, 'Professional preserves all select options');
    for (const mission of ['agriculture', 'delivery', 'custom']) {
      select('mission', mission);
      check(Object.values(professionalAdvice).every((message) => !recommendationItems().includes(message)),
        `${mission}: Professional advice removed`);
      status(expectedStatus);
    }
  }

  payload(0);
  select('mission', 'professional');
  const cameraControl = checkboxes.find((item) => item.value === 'electronics-camera');
  const gimbalControl = checkboxes.find((item) => item.value === 'electronics-gimbal');
  cameraControl.click();
  check(!recommendationItems().includes(professionalAdvice.equipment), 'Camera satisfies mission equipment advice');
  check(recommendationItems().includes(professionalAdvice.gimbal), 'Camera without Gimbal shows stabilization advice');
  gimbalControl.click();
  check(!recommendationItems().includes(professionalAdvice.gimbal), 'adding Gimbal removes stabilization advice');
  gimbalControl.click();
  check(recommendationItems().includes(professionalAdvice.gimbal), 'removing Gimbal restores stabilization advice');
  cameraControl.click();
  check(recommendationItems().includes(professionalAdvice.equipment), 'removing Camera restores equipment advice');
  for (const id of ['electronics-thermal-camera', 'electronics-lidar']) {
    const control = checkboxes.find((item) => item.value === id);
    control.click();
    check(!recommendationItems().includes(professionalAdvice.equipment), `${id}: recognized as mission equipment`);
    control.click();
  }
  select('battery', 'battery-b6-5000');
  check(recommendationItems().includes(professionalAdvice.battery), 'low-energy battery advice shown');
  check(!recommendationItems().includes(professionalAdvice.endurance), 'low energy replaces generic endurance advice');
  select('battery', 'battery-b6-10000');
  check(!recommendationItems().includes(professionalAdvice.battery), 'higher-energy battery clears advice');

  select('motor', 'motor-m6215');
  select('propeller', 'propeller-p9045');
  select('esc', 'esc-v90');
  select('battery', 'battery-b8-12000');
  checkboxes.find((item) => item.value === 'electronics-lidar').click();
  status('Valid');
  check(parseFloat(text('estimated-flight-time')) >= 15, 'suitable Professional flight endurance');
  check(recommendationItems().length === 0 && element('mission-recommendations').hidden,
    'suitable Professional configuration has no recommendations');
  payload(1000);
  check(recommendationItems().includes(professionalAdvice.endurance), 'payload change refreshes endurance advice');
  payload(30000);
  check(text('estimated-flight-time') === '--' && !recommendationItems().includes(professionalAdvice.endurance),
    'unavailable flight time does not produce endurance advice');
  completed.push('Professional equipment, stabilization, endurance and battery advice preserve state/options/status');

  select('frame', 'frame-aster-960');
  const canvas = droneView.renderer.domElement;
  for (const [count, name] of [[4, 'Quad'], [6, 'Hexa'], [8, 'Octo'], [4, 'Quad']]) {
    select('rotor-count', count);
    const model = await droneView.modelReady;
    check(model.getObjectByName(`${name}_Body`), `UI ${count}: displays Blender ${name}`);
    check(droneView.scene.children.filter((part) => part.isGroup).length === 1, `UI ${count}: one frame`);
    check(document.querySelector('#three-container canvas') === canvas, 'UI switching retains canvas');
  }
  select('frame', '');
  check((await droneView.modelReady).getObjectByName('Quad_Body'), 'clearing frame restores neutral Quad');
  completed.push('Rotor count UI switches Quad/Hexa/Octo/Quad and frame reset restores neutral Quad');

  await new Promise((resolve) => setTimeout(resolve, 100));
  check(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  element('smoke-result').textContent = `PASS: ${completed.join('; ')}`;
} catch (error) {
  element('smoke-result').textContent = `FAIL: ${error.stack ?? error}; browser errors: ${errors.join('; ')}`;
}
