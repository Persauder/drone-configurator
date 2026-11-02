import './style.css';
import { calculateBasicSummary } from './configurator/calculator';
import { configuration } from './configurator/configuration';
import { resolveRotorCount } from './configurator/frameSelection';
import { getMissionRecommendations } from './configurator/recommendations';
import type { MissionType } from './configurator/types';
import { validateConfiguration } from './configurator/validator';
import { batteries } from './data/batteries';
import { escs } from './data/escs';
import { electronics } from './data/electronics';
import { frames } from './data/frames';
import { motors } from './data/motors';
import { propellers } from './data/propellers';
import { initializeScene } from './three/scene';
import { enhanceSelects } from './ui/customSelect';

interface SelectItem {
  id: string;
  name: string;
}

function populateSelect(selectId: string, items: readonly SelectItem[]): void {
  const select = document.querySelector<HTMLSelectElement>(`#${selectId}`);

  if (!select) {
    throw new Error(`Select element #${selectId} was not found.`);
  }

  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  }
}

function bindComponentSelect<T extends SelectItem>(
  selectId: string,
  items: readonly T[],
  updateConfiguration: (component: T | undefined) => void,
): void {
  const select = document.querySelector<HTMLSelectElement>(`#${selectId}`);

  if (!select) {
    throw new Error(`Select element #${selectId} was not found.`);
  }

  select.addEventListener('change', () => {
    updateConfiguration(items.find((item) => item.id === select.value));
  });
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Application root element was not found.');
}

const missionOptions: readonly { id: MissionType; name: string }[] = [
  { id: 'agriculture', name: 'Agriculture' },
  { id: 'delivery', name: 'Delivery' },
  { id: 'professional', name: 'Professional' },
  { id: 'custom', name: 'Custom' },
];

function renderSelectField(id: string, label: string): string {
  return `
      <div class="field">
        <label class="field-label" id="${id}-label" for="${id}">${label}</label>
        <select id="${id}" name="${id}"${id === 'rotor-count' ? ' disabled' : ''}>
          <option value="" selected>Select ${label.toLowerCase()}</option>
        </select>
      </div>`;
}

app.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true">DC</div>
      <div>
        <h1>Drone Configurator</h1>
        <p>Interactive multirotor drone configuration system</p>
      </div>
    </header>

    <main class="workspace">
      <aside class="configuration-panel" aria-labelledby="configuration-title">
        <div class="section-heading configuration-heading">
          <div>
            <span class="eyebrow">Components</span>
            <h2 id="configuration-title">Configuration</h2>
          </div>
          <span class="configuration-heading-mark" aria-hidden="true"></span>
        </div>
        <div class="configuration-progress">
          <div class="configuration-progress-label"><span>Build progress</span><strong id="build-progress-value">0 / 6</strong></div>
          <div class="configuration-progress-track" role="progressbar" aria-label="Selected components" aria-valuemin="0" aria-valuemax="6" aria-valuenow="0">
            <span id="build-progress-fill"></span>
          </div>
        </div>
        <form class="configuration-form">
          <section class="config-group config-group--mission" aria-label="Mission">
            <div class="field field--mission">
              <label class="field-label" id="mission-label" for="mission">Mission</label>
              <select id="mission" name="mission">
                ${missionOptions.map(({ id, name }) => `<option value="${id}"${id === configuration.mission ? ' selected' : ''}>${name}</option>`).join('')}
              </select>
            </div>
          </section>
          <section class="config-group" aria-labelledby="airframe-title">
            <div class="config-group-heading"><span>01</span><h3 id="airframe-title">Airframe</h3></div>
            ${renderSelectField('frame', 'Frame')}
            ${renderSelectField('rotor-count', 'Rotor count')}
          </section>
          <section class="config-group" aria-labelledby="propulsion-title">
            <div class="config-group-heading"><span>02</span><h3 id="propulsion-title">Propulsion</h3></div>
            ${renderSelectField('motor', 'Motor')}
            ${renderSelectField('propeller', 'Propeller')}
            ${renderSelectField('esc', 'ESC')}
            ${renderSelectField('battery', 'Battery')}
          </section>
          <section class="config-group config-group--electronics" aria-labelledby="electronics-title">
            <div class="config-group-heading"><span>03</span><h3 id="electronics-title">Electronics</h3></div>
            <section class="required-electronics" aria-labelledby="required-electronics-title">
              <span id="required-electronics-title" class="required-electronics-title">Required electronics</span>
              <ul id="required-electronics-list" class="required-electronics-list"></ul>
            </section>
            <section class="optional-electronics" aria-labelledby="optional-electronics-title">
              <span id="optional-electronics-title" class="optional-electronics-title">Optional electronics</span>
              <ul id="optional-electronics-list" class="optional-electronics-list"></ul>
            </section>
          </section>
          <section class="config-group config-group--payload" aria-labelledby="load-title">
            <div class="config-group-heading"><span>04</span><h3 id="load-title">Load</h3></div>
            <label class="field" for="payload">
              <span>Payload</span>
              <span class="input-with-unit">
                <input id="payload" name="payload" type="number" min="0" step="1" value="0" />
                <span aria-hidden="true">g</span>
              </span>
            </label>
          </section>
        </form>
        <p class="panel-note">Select components to prepare a drone configuration.</p>
      </aside>

      <section class="viewer-panel" aria-labelledby="viewer-title">
        <div class="viewer-toolbar">
          <div>
            <span class="eyebrow">Workspace</span>
            <h2 id="viewer-title">3D View</h2>
          </div>
          <div class="viewer-hint">Drag to rotate · Scroll to zoom</div>
          <div id="assembly-actions" class="viewer-actions" hidden>
            <button id="assembly-open" class="viewer-action" type="button">Play assembly</button>
            <div id="assembly-playback" class="assembly-playback" hidden>
              <button id="assembly-pause" class="viewer-action" type="button">Pause</button>
              <button id="assembly-restart" class="viewer-action" type="button">Restart</button>
              <button id="assembly-exit" class="viewer-action" type="button">Back to configurator</button>
            </div>
            <span id="assembly-status" class="assembly-status" role="status" aria-live="polite"></span>
          </div>
        </div>
        <div id="three-container" class="three-container" aria-label="Interactive 3D preview"></div>
      </section>

      <aside class="insights-column" aria-label="Drone specifications and recommendations">
        <section class="parameters-panel" aria-labelledby="parameters-title">
          <div class="spec-header">
            <div>
              <span class="eyebrow">Summary</span>
              <h2 id="parameters-title">Configuration Parameters</h2>
            </div>
            <span class="spec-header-mark" aria-hidden="true"></span>
          </div>
          <dl class="parameter-grid">
            <div class="parameter parameter--mission"><dt>Mission</dt><dd id="mission-summary">--</dd></div>
            <div class="parameter parameter--highlight"><dt>Total mass</dt><dd id="total-mass">--</dd></div>
            <div class="parameter parameter--highlight parameter--flight"><dt>Estimated flight time</dt><dd id="estimated-flight-time">--</dd></div>
            <div class="parameter parameter--highlight"><dt>Thrust / Weight</dt><dd id="thrust-to-weight">--</dd></div>
            <div class="parameter parameter--highlight parameter--flight"><dt>Performance</dt><dd id="thrust-performance">--</dd></div>
            <div class="parameter"><dt>Average current</dt><dd id="average-current">--</dd></div>
            <div class="parameter"><dt>Maximum current</dt><dd id="maximum-current">--</dd></div>
            <div class="parameter"><dt>Estimated hover power</dt><dd id="average-power">--</dd></div>
            <div class="parameter"><dt>Battery energy</dt><dd id="battery-energy">--</dd></div>
            <div class="parameter"><dt>Usable battery energy</dt><dd id="usable-battery-energy">--</dd></div>
            <div class="parameter"><dt>Total thrust</dt><dd id="total-thrust">--</dd></div>
            <div class="parameter parameter--voltage"><dt>Required voltage</dt><dd id="required-voltage">--</dd></div>
            <div class="parameter parameter--status status">
              <dt>Status</dt>
              <dd><span id="status-dot" class="status-dot"></span><span id="validation-status">Valid</span></dd>
              <ul id="validation-messages" class="validation-messages"></ul>
            </div>
          </dl>
        </section>
        <section id="mission-recommendations" class="mission-recommendations" aria-labelledby="mission-recommendations-title" hidden>
          <div class="section-heading">
            <h2 id="mission-recommendations-title">Mission recommendations</h2>
          </div>
          <ul id="mission-recommendations-list" aria-live="polite"></ul>
        </section>
      </aside>
    </main>
  </div>
`;

interface SummaryElements {
  mission: HTMLElement;
  totalMass: HTMLElement;
  averageCurrent: HTMLElement;
  maximumCurrent: HTMLElement;
  averagePower: HTMLElement;
  batteryEnergy: HTMLElement;
  usableBatteryEnergy: HTMLElement;
  estimatedFlightTime: HTMLElement;
  totalThrust: HTMLElement;
  thrustToWeight: HTMLElement;
  thrustPerformance: HTMLElement;
  requiredVoltage: HTMLElement;
  status: HTMLElement;
  statusDot: HTMLElement;
  messages: HTMLUListElement;
}

const missionOutput = document.querySelector<HTMLElement>('#mission-summary');
const totalMassOutput = document.querySelector<HTMLElement>('#total-mass');
const averageCurrentOutput = document.querySelector<HTMLElement>('#average-current');
const maximumCurrentOutput = document.querySelector<HTMLElement>('#maximum-current');
const averagePowerOutput = document.querySelector<HTMLElement>('#average-power');
const batteryEnergyOutput = document.querySelector<HTMLElement>('#battery-energy');
const usableBatteryEnergyOutput = document.querySelector<HTMLElement>('#usable-battery-energy');
const estimatedFlightTimeOutput = document.querySelector<HTMLElement>('#estimated-flight-time');
const totalThrustOutput = document.querySelector<HTMLElement>('#total-thrust');
const thrustToWeightOutput = document.querySelector<HTMLElement>('#thrust-to-weight');
const thrustPerformanceOutput = document.querySelector<HTMLElement>('#thrust-performance');
const requiredVoltageOutput = document.querySelector<HTMLElement>('#required-voltage');
const validationStatusOutput = document.querySelector<HTMLElement>('#validation-status');
const validationStatusDot = document.querySelector<HTMLElement>('#status-dot');
const validationMessagesList = document.querySelector<HTMLUListElement>('#validation-messages');
const recommendationsPanel = document.querySelector<HTMLElement>('#mission-recommendations');
const recommendationsList = document.querySelector<HTMLUListElement>('#mission-recommendations-list');

if (!recommendationsPanel || !recommendationsList) {
  throw new Error('Mission recommendation elements were not found.');
}

const recommendationElements = { panel: recommendationsPanel, list: recommendationsList };

if (!missionOutput || !totalMassOutput || !averageCurrentOutput || !maximumCurrentOutput || !averagePowerOutput
  || !batteryEnergyOutput || !usableBatteryEnergyOutput || !estimatedFlightTimeOutput
  || !totalThrustOutput || !thrustToWeightOutput
  || !thrustPerformanceOutput || !requiredVoltageOutput || !validationStatusOutput || !validationStatusDot || !validationMessagesList) {
  throw new Error('Summary output elements were not found.');
}

const summaryElements: SummaryElements = {
  mission: missionOutput,
  totalMass: totalMassOutput,
  averageCurrent: averageCurrentOutput,
  maximumCurrent: maximumCurrentOutput,
  averagePower: averagePowerOutput,
  batteryEnergy: batteryEnergyOutput,
  usableBatteryEnergy: usableBatteryEnergyOutput,
  estimatedFlightTime: estimatedFlightTimeOutput,
  totalThrust: totalThrustOutput,
  thrustToWeight: thrustToWeightOutput,
  thrustPerformance: thrustPerformanceOutput,
  requiredVoltage: requiredVoltageOutput,
  status: validationStatusOutput,
  statusDot: validationStatusDot,
  messages: validationMessagesList,
};

function getThrustPerformanceLabel(thrustToWeight: number | undefined): string {
  if (thrustToWeight === undefined || !Number.isFinite(thrustToWeight)) {
    return '--';
  }

  if (thrustToWeight < 1) return 'Insufficient';
  if (thrustToWeight < 1.3) return 'Very low';
  if (thrustToWeight < 1.6) return 'Moderate';
  if (thrustToWeight < 2) return 'Good';
  return 'High';
}

function formatPower(powerW: number | undefined): string {
  if (powerW === undefined) {
    return '--';
  }

  return powerW >= 1000
    ? `${(powerW / 1000).toFixed(2)} kW`
    : `${powerW.toFixed(1)} W`;
}

function formatBatteryEnergy(energyWh: number | undefined): string {
  if (energyWh === undefined) {
    return '--';
  }

  if (energyWh >= 1000) {
    return `${(energyWh / 1000).toFixed(2)} kWh`;
  }

  return `${energyWh.toFixed(Number.isInteger(energyWh) ? 0 : 1)} Wh`;
}

function updateMissionRecommendations(): void {
  const recommendations = getMissionRecommendations(configuration);
  recommendationElements.list.replaceChildren();

  for (const recommendation of recommendations) {
    const item = document.createElement('li');
    item.textContent = recommendation.message;
    item.dataset.level = recommendation.level;
    recommendationElements.list.append(item);
  }

  recommendationElements.panel.hidden = recommendations.length === 0;
}

function updateSummary(elements: SummaryElements): void {
  const summary = calculateBasicSummary(configuration);

  elements.mission.textContent = missionOptions.find((item) => item.id === configuration.mission)?.name ?? '--';
  elements.totalMass.textContent = `${summary.totalMassKg.toFixed(2)} kg`;
  elements.averageCurrent.textContent = summary.averageCurrentA !== undefined
    ? `${summary.averageCurrentA.toFixed(1)} A`
    : '--';
  elements.maximumCurrent.textContent = summary.maximumCurrentA !== undefined
    ? `${summary.maximumCurrentA.toFixed(1)} A`
    : '--';
  elements.averagePower.textContent = formatPower(summary.averagePowerW);
  elements.batteryEnergy.textContent = formatBatteryEnergy(summary.batteryEnergyWh);
  elements.usableBatteryEnergy.textContent = formatBatteryEnergy(summary.usableBatteryEnergyWh);
  elements.estimatedFlightTime.textContent = summary.estimatedFlightTimeMinutes !== undefined
    ? `${summary.estimatedFlightTimeMinutes.toFixed(1)} min`
    : '--';
  elements.totalThrust.textContent = summary.totalThrustKg !== undefined
    ? `${summary.totalThrustKg.toFixed(2)} kg`
    : '--';
  elements.thrustToWeight.textContent = summary.thrustToWeight !== undefined
    ? summary.thrustToWeight.toFixed(2)
    : '--';
  elements.thrustPerformance.textContent = getThrustPerformanceLabel(summary.thrustToWeight);
  elements.requiredVoltage.textContent = summary.requiredVoltageMin !== undefined
    && summary.requiredVoltageMax !== undefined
    ? `${summary.requiredVoltageMin.toFixed(1)}–${summary.requiredVoltageMax.toFixed(1)} V`
    : '--';

  const messages = validateConfiguration(configuration).filter((message) => message.level !== 'valid');
  const hasError = messages.some((message) => message.level === 'error');
  const hasWarning = messages.some((message) => message.level === 'warning');
  const isValid = !hasError && !hasWarning;

  elements.status.textContent = hasError ? 'Invalid' : hasWarning ? 'Warning' : 'Valid';
  elements.statusDot.classList.toggle('valid', isValid);
  elements.statusDot.classList.toggle('invalid', hasError);
  elements.statusDot.classList.toggle('warning', !hasError && hasWarning);
  elements.messages.replaceChildren();

  for (const message of messages) {
    const listItem = document.createElement('li');
    listItem.textContent = message.message;
    listItem.classList.add(message.level);
    elements.messages.append(listItem);
  }
  updateMissionRecommendations();
}

updateSummary(summaryElements);

const missionSelect = document.querySelector<HTMLSelectElement>('#mission');

if (!missionSelect) {
  throw new Error('Mission select was not found.');
}

missionSelect.addEventListener('change', () => {
  const mission = missionOptions.find((item) => item.id === missionSelect.value);

  if (mission) {
    configuration.mission = mission.id;
    summaryElements.mission.textContent = mission.name;
    updateMissionRecommendations();
  }
});

populateSelect('frame', frames);
populateSelect('motor', motors);
populateSelect('propeller', propellers);
populateSelect('esc', escs);
populateSelect('battery', batteries);
enhanceSelects(document);

const componentSelectIds = ['frame', 'rotor-count', 'motor', 'propeller', 'esc', 'battery'];
const progressValue = document.querySelector<HTMLElement>('#build-progress-value');
const progressTrack = document.querySelector<HTMLElement>('.configuration-progress-track');
const progressFill = document.querySelector<HTMLElement>('#build-progress-fill');
const configurationForm = document.querySelector<HTMLFormElement>('.configuration-form');

if (!progressValue || !progressTrack || !progressFill || !configurationForm) {
  throw new Error('Build progress elements were not found.');
}

const buildProgress = { value: progressValue, track: progressTrack, fill: progressFill };

function updateBuildProgress(): void {
  const selectedCount = componentSelectIds.filter((id) => {
    const select = document.querySelector<HTMLSelectElement>(`#${id}`);
    return Boolean(select && select.value !== '');
  }).length;
  buildProgress.value.textContent = `${selectedCount} / ${componentSelectIds.length}`;
  buildProgress.track.setAttribute('aria-valuenow', String(selectedCount));
  buildProgress.fill.style.width = `${selectedCount / componentSelectIds.length * 100}%`;
}

configurationForm.addEventListener('change', updateBuildProgress);
updateBuildProgress();

const requiredElectronicsList = document.querySelector<HTMLUListElement>('#required-electronics-list');

if (!requiredElectronicsList) {
  throw new Error('Required electronics list was not found.');
}

for (const component of configuration.electronics) {
  const listItem = document.createElement('li');
  const name = document.createElement('span');
  const requiredLabel = document.createElement('small');

  name.textContent = component.name;
  requiredLabel.textContent = 'Required';
  listItem.append(name, requiredLabel);
  requiredElectronicsList.append(listItem);
}

const optionalElectronicsList = document.querySelector<HTMLUListElement>('#optional-electronics-list');

if (!optionalElectronicsList) {
  throw new Error('Optional electronics list was not found.');
}

for (const component of electronics.filter((item) => !item.required)) {
  const listItem = document.createElement('li');
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  const name = document.createElement('span');

  checkbox.type = 'checkbox';
  checkbox.name = 'optional-electronics';
  checkbox.value = component.id;
  checkbox.checked = configuration.electronics.some((item) => item.id === component.id);
  name.textContent = component.name;

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      const alreadySelected = configuration.electronics.some((item) => item.id === component.id);

      if (!alreadySelected) {
        configuration.electronics.push(component);
      }
    } else {
      configuration.electronics = configuration.electronics.filter(
        (item) => item.required || item.id !== component.id,
      );
    }

    updateSummary(summaryElements);
  });

  label.append(checkbox, name);
  listItem.append(label);
  optionalElectronicsList.append(listItem);
}

const rotorCountSelect = document.querySelector<HTMLSelectElement>('#rotor-count');

if (!rotorCountSelect) {
  throw new Error('Rotor count select was not found.');
}

function updateRotorCountOptions(
  select: HTMLSelectElement,
  rotorCounts: readonly number[],
): void {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select rotor count';
  placeholder.selected = true;

  select.replaceChildren(placeholder);

  for (const rotorCount of rotorCounts) {
    const option = document.createElement('option');
    option.value = String(rotorCount);
    option.textContent = `${rotorCount} rotors`;
    select.append(option);
  }

  select.disabled = rotorCounts.length === 0;
}

bindComponentSelect('frame', frames, (frame) => {
  configuration.frame = frame;
  configuration.rotorCount = resolveRotorCount(frame, undefined);
  updateRotorCountOptions(rotorCountSelect, frame?.allowedRotorCounts ?? []);
  rotorCountSelect.value = configuration.rotorCount === undefined ? '' : String(configuration.rotorCount);
  void droneView.setDroneFrame(configuration.rotorCount, configuration.frame?.id);
  updateAssemblyAvailability();
  updateSummary(summaryElements);
});

rotorCountSelect.addEventListener('change', () => {
  const rotorCount = Number(rotorCountSelect.value);
  const requested = rotorCountSelect.value !== '' && Number.isInteger(rotorCount)
    ? rotorCount
    : undefined;
  configuration.rotorCount = resolveRotorCount(configuration.frame, requested);
  rotorCountSelect.value = configuration.rotorCount === undefined ? '' : String(configuration.rotorCount);
  void droneView.setDroneFrame(configuration.rotorCount, configuration.frame?.id);
  updateAssemblyAvailability();
  updateSummary(summaryElements);
});
bindComponentSelect('motor', motors, (motor) => {
  configuration.motor = motor;
  void droneView.setSelectedMotor(motor?.id);
  updateSummary(summaryElements);
});
bindComponentSelect('propeller', propellers, (propeller) => {
  configuration.propeller = propeller;
  void droneView.setSelectedPropeller(propeller?.id);
  updateSummary(summaryElements);
});
bindComponentSelect('esc', escs, (esc) => {
  configuration.esc = esc;
  void droneView.setSelectedEsc(esc?.id);
  updateSummary(summaryElements);
});
bindComponentSelect('battery', batteries, (battery) => {
  configuration.battery = battery;
  void droneView.setSelectedBattery(battery?.id);
  updateSummary(summaryElements);
});

const payloadInput = document.querySelector<HTMLInputElement>('#payload');

if (!payloadInput) {
  throw new Error('Payload input was not found.');
}

payloadInput.addEventListener('input', () => {
  const payloadGrams = payloadInput.valueAsNumber;

  if (!Number.isFinite(payloadGrams) || payloadGrams < 0) {
    configuration.payloadKg = 0;
    updateSummary(summaryElements);

    if (payloadGrams < 0) {
      payloadInput.value = '0';
    }

    return;
  }

  configuration.payloadKg = payloadGrams / 1000;
  updateSummary(summaryElements);
});

const threeContainer = document.querySelector<HTMLElement>('#three-container');

if (!threeContainer) {
  throw new Error('Three.js container was not found.');
}

export const droneView = initializeScene(threeContainer, configuration.rotorCount, configuration.frame?.id);

const assemblyActions = document.querySelector<HTMLElement>('#assembly-actions');
const assemblyOpen = document.querySelector<HTMLButtonElement>('#assembly-open');
const assemblyPlayback = document.querySelector<HTMLElement>('#assembly-playback');
const assemblyPause = document.querySelector<HTMLButtonElement>('#assembly-pause');
const assemblyRestart = document.querySelector<HTMLButtonElement>('#assembly-restart');
const assemblyExit = document.querySelector<HTMLButtonElement>('#assembly-exit');
const assemblyStatus = document.querySelector<HTMLElement>('#assembly-status');
if (!assemblyActions || !assemblyOpen || !assemblyPlayback || !assemblyPause
  || !assemblyRestart || !assemblyExit || !assemblyStatus) {
  throw new Error('Assembly viewer controls were not found.');
}
const assemblyUi = {
  actions: assemblyActions, open: assemblyOpen, playback: assemblyPlayback,
  pause: assemblyPause, restart: assemblyRestart, exit: assemblyExit, status: assemblyStatus,
};

function updateAssemblyAvailability(): void {
  const available = configuration.frame?.id === 'frame-aster-450' && configuration.rotorCount === 4;
  assemblyUi.actions.hidden = !available;
  if (!available) return;
  const status = droneView.assemblyStatus;
  const active = status === 'loading' || status === 'playing' || status === 'paused' || status === 'complete';
  assemblyUi.open.hidden = active;
  assemblyUi.playback.hidden = !active;
  assemblyUi.pause.hidden = status === 'complete';
  assemblyUi.pause.disabled = status === 'loading';
  assemblyUi.pause.textContent = status === 'paused' ? 'Resume' : 'Pause';
  assemblyUi.restart.disabled = status === 'loading';
  assemblyUi.restart.textContent = status === 'complete' ? 'Replay' : 'Restart';
  assemblyUi.exit.disabled = status === 'loading';
  assemblyUi.status.textContent = {
    idle: '', loading: 'Loading assembly…', playing: 'Aster 450 — Assembly',
    paused: 'Assembly paused', complete: 'Assembly complete',
    error: 'Assembly could not load. Try again.',
  }[status];
}

droneView.onAssemblyStatusChange(updateAssemblyAvailability);
assemblyOpen.addEventListener('click', () => { void droneView.enterAssembly(); });
assemblyPause.addEventListener('click', () => {
  if (droneView.assemblyStatus === 'paused') droneView.resumeAssembly();
  else droneView.pauseAssembly();
});
assemblyRestart.addEventListener('click', droneView.restartAssembly);
assemblyExit.addEventListener('click', droneView.exitAssembly);
updateAssemblyAvailability();
