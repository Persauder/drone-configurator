# Drone Configurator — Complete Project Documentation

> This document reflects the actual state of the working directory `E:\drone-configurator` as of November 2, 2026.
> It covers the source code, datasets, 3D pipeline, UI, tests, assets, Git branch layout, and known limitations.
>
> **Important:** the original `README.md` described an early prototype with a test cube. The current application is a full configurator with calculations, validation, mission recommendations, and a modular 3D assembly pipeline.

---

## 1. Project Overview

**Drone Configurator** is a browser-based prototype of an interactive multirotor configuration system. The user selects a mission, frame, rotor count, motors, propellers, ESCs, battery, electronics, and payload. The application:

- renders a Three.js drone preview;
- calculates mass, thrust, current, voltage, power, battery energy, and estimated flight time;
- validates the configuration and displays `Valid` / `Warning` / `Invalid`;
- generates mission-specific recommendations;
- for **Aster 450 + 4 rotors**, plays animated component installation and a complete assembly sequence.

The project is intended as the technical foundation for a diploma project. Component data is synthetic/prototype data, not certified hardware specifications.

### Technology Stack

| Layer | Technology |
|---|---|
| Build tool | Vite 7 |
| Language | TypeScript 5.9, `strict: true` |
| UI | Vanilla TypeScript, no framework |
| 3D | Three.js 0.179 + `OrbitControls` + `GLTFLoader` |
| Styling | One global CSS file |
| Tests | `node:test` + `esbuild` in-memory bundling + headless Chrome/Edge/Chromium |

---

## 2. Quick Start and Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc && vite build
npm run preview    # preview the built dist
npm run typecheck  # tsc --noEmit
npm test           # node --test tests/*.mjs
npm run test:ui    # real-browser smoke tests
```

### Notes

- There is no `vite.config.*`; Vite defaults are used. The entry point is the root `index.html`, and static files live in `public/`.
- `npm run build` runs `tsc` with `noEmit: true` (type checking only), then `vite build`. Output goes to `dist/`.
- UI tests use an installed Chrome, Edge, or Chromium. Override the executable with `CHROME_PATH`.
- Unit tests import `esbuild`, which is **not declared directly** in `package.json`; it comes transitively through Vite. This should be considered when updating the build toolchain.
- Tests bundle TypeScript in memory with `esbuild.build({ write: false })` and import the result as `data:text/javascript;base64,...`. No separate compiled test output is required.

### Versions from `package-lock.json`

| Package | Version |
|---|---|
| `three` | 0.179.1 |
| `@types/three` | 0.179.0 |
| `typescript` | 5.9.3 |
| `vite` | 7.3.6 |

---

## 3. Project Structure

```text
drone-configurator/
├── index.html                     # Vite HTML entry point
├── package.json                   # Scripts and dependencies
├── package-lock.json
├── tsconfig.json                  # Strict TypeScript configuration
├── README.md                      # Concise project overview
├── DOCUMENTATION.md               # This document
├── img.png, img_1.png,
│   img_2.png, img_3.png           # UI screenshots (not used by the app)
├── public/
│   └── models/                    # GLB assets served from the site root
│       ├── quad_frame.glb
│       ├── hexa_frame.glb
│       ├── octo_frame.glb
│       ├── aster_450_base.glb             # duplicate/legacy variant
│       ├── aster_450_quad.glb             # duplicate/legacy variant
│       ├── frames/aster-450/
│       │   ├── aster_450_base.glb
│       │   └── aster_450_quad.glb
│       ├── motors/small/
│       │   ├── small_motor_open.glb
│       │   └── small_motor_closed.glb
│       ├── propellers/small/
│       │   ├── small_propeller_cw.glb
│       │   ├── small_propeller_ccw.glb
│       │   └── small_prop_retaining_cap.glb
│       ├── escs/small/
│       │   ├── small_esc.glb              # not referenced by code
│       │   └── small_esc_4in1.glb
│       ├── batteries/small/
│       │   └── small_battery.glb
│       └── animations/aster-450/
│           ├── aster450_full_assembly.glb       # used
│           ├── aster450_propeller_assembly.glb  # not referenced by code
│           ├── aster450_esc_assembly.glb        # not referenced by code
│           └── aster450_battery_assembly.glb    # not referenced by code
├── src/
│   ├── main.ts                    # Application markup, UI state, event handlers
│   ├── style.css                  # All styles and responsive rules
│   ├── vite-env.d.ts
│   ├── assets/.gitkeep
│   ├── data/                      # Component catalogs
│   │   ├── frames.ts
│   │   ├── motors.ts
│   │   ├── propellers.ts
│   │   ├── escs.ts
│   │   ├── batteries.ts
│   │   └── electronics.ts
│   ├── configurator/
│   │   ├── types.ts               # Domain types
│   │   ├── configuration.ts       # Initial configuration
│   │   ├── calculator.ts          # Calculations
│   │   ├── validator.ts           # Validation rules
│   │   ├── recommendations.ts     # Mission recommendations
│   │   └── frameSelection.ts      # Rotor-count compatibility
│   ├── three/
│   │   ├── scene.ts               # Scene, loading, mounting, animation
│   │   ├── controls.ts            # OrbitControls setup
│   │   ├── modelLoader.ts         # GLTFLoader wrapper
│   │   ├── droneModel.ts          # Procedural fallback model
│   │   ├── frameModels.ts         # Frame ID → GLB + anchors
│   │   ├── motorModels.ts         # Motor ID → GLB
│   │   ├── propellerModels.ts     # Propeller ID → CW/CCW pair + cap
│   │   ├── escModels.ts           # ESC ID → GLB
│   │   ├── batteryModels.ts       # Battery ID → GLB
│   │   ├── assemblyModels.ts      # Frame ID → full assembly GLB
│   │   └── selectionAnimations.ts # Clip trimming and playback
│   ├── models/                    # Generic GLB copies, not used by code
│   └── ui/
│       └── customSelect.ts        # Accessible custom select
└── tests/
    ├── *.mjs                      # Unit/integration tests
    └── ui/
        ├── smoke.mjs              # Browser test runner
        ├── *.html                 # Browser test pages
        ├── *.browser.js           # In-browser test scenarios
        └── esc-*-capture.html     # Manual QA screenshot pages
```

---

## 4. Architecture and Data Flow

```text
index.html
   └── src/main.ts
         ├── injects the application markup into #app
         ├── configuration (mutable singleton)
         │      ├── data/*.ts  ──────────────┐
         │      ├── calculator.ts            │ calculations
         │      ├── validator.ts             │ validation
         │      └── recommendations.ts       │ mission advice
         ├── customSelect.ts  (enhances every select)
         └── three/scene.ts (initializeScene)
                ├── modelLoader.ts
                ├── frame/motor/propeller/esc/battery/assemblyModels.ts
                ├── selectionAnimations.ts
                └── droneModel.ts (fallback)
```

### Core Principles

1. **Single source of truth.** `configuration` from `src/configurator/configuration.ts` is a mutable singleton. UI controls update its fields, then call `updateSummary()` and/or 3D scene methods.
2. **Pure calculation functions.** `calculator.ts`, `validator.ts`, and `recommendations.ts` do not mutate the configuration and do not depend on the DOM.
3. **No UI framework.** Markup is generated as a template string in `main.ts`; elements are queried with `querySelector` and updated manually.
4. **Stable IDs connect catalogs and assets.** For example, `motor-m2216` is both a catalog ID in `data/motors.ts` and a key in `three/motorModels.ts`. Display names are never used to resolve assets.
5. **Graceful 3D degradation.** If a GLB fails to load, a procedural model is shown. If animation clips do not match, components are placed in their final positions. Errors are logged with `console.warn`, and the application keeps working.
6. **Race protection.** `scene.ts` uses version counters (`requestVersion`, `motorVersion`, `escVersion`, `batteryVersion`, `propellerVersion`, `assemblyVersion`) and promise caches. Late responses from stale requests are ignored.

### 4.1 Git Branch Layout

The repository uses one integrated branch and a set of feature branches. Each feature branch is a reviewable milestone in the project's build-up; `main` contains the complete, integrated application.

| Branch | Purpose |
|---|---|
| `main` | Complete integrated project |
| `chore/project-scaffold` | Vite/TypeScript scaffold, package metadata, root HTML, ignore rules |
| `feature/component-catalog` | Domain types and all component datasets |
| `feature/calculations-validation` | Mass/thrust/current/voltage/energy calculations and validation rules |
| `feature/mission-recommendations` | Mission advice, frame/rotor compatibility |
| `feature/configurator-ui` | Application markup, UI state, custom select, styles |
| `feature/3d-viewer` | Three.js scene, GLB loading, model resolution, fallback model, assets |
| `feature/modular-assembly` | Selection animations and the complete Aster 450 assembly pipeline |
| `test/automated-coverage` | Unit, integration, GLB, and browser tests |
| `docs/english-documentation` | English README and this documentation |

Feature branches are cumulative milestones, not independent standalone applications. Always use `main` for development and builds.

---

## 5. Domain Model (`src/configurator/types.ts`)

### Units

| Quantity | Unit |
|---|---|
| Mass | kg |
| Voltage | V |
| Current | A |
| Battery capacity | Ah |
| Power | W |
| Motor thrust | kgf (kg-equivalent lift), not newtons |
| Propeller diameter/pitch | inches |
| Energy | Wh (`V × Ah`) |
| UI payload | grams; state stores kilograms |

### Types

```ts
type MissionType = 'agriculture' | 'delivery' | 'professional' | 'custom';

interface DroneComponent {
  id: string;
  name: string;
  weightKg: number;
}

interface Frame extends DroneComponent {
  allowedRotorCounts: number[];
  maxPayloadKg: number;
  maxTakeoffWeightKg: number;
  maxPropellerDiameterInch: number;
}

interface Motor extends DroneComponent {
  minVoltage: number;
  maxVoltage: number;
  averageCurrent: number;
  maxCurrent: number;
  maxThrustKg: number;
}

interface Propeller extends DroneComponent {
  diameterInch: number;
  pitchInch: number;
}

interface ESC extends DroneComponent {
  topology: 'individual' | '4in1';
  minVoltage: number;
  maxVoltage: number;
  continuousCurrent: number; // per motor channel for both topologies
  peakCurrent: number;       // per motor channel
}

interface ElectronicComponent extends DroneComponent {
  category: string;
  required: boolean;
  averagePowerW: number;
  operatingVoltage: number;
}

interface Battery extends DroneComponent {
  voltage: number;
  capacityAh: number;
  maxContinuousCurrent: number;
}

interface DroneConfiguration {
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
```

### ESC Semantics

- `individual` — one ESC per motor; physical quantity = `rotorCount`.
- `4in1` — one physical module for the whole drone; quantity = `1`.
- `continuousCurrent` and `peakCurrent` are **per motor channel** for both topologies, not summed module ratings.

---

## 6. Initial Configuration (`configuration.ts`)

```ts
export const configuration: DroneConfiguration = {
  mission: 'custom',
  frame: undefined,
  rotorCount: undefined,
  motor: undefined,
  propeller: undefined,
  esc: undefined,
  electronics: electronics.filter((component) => component.required),
  battery: undefined,
  payloadKg: 0,
};
```

At startup:

- mission is `Custom`;
- all selectable components are empty;
- the three required electronic components are already included;
- payload is 0 kg;
- the 3D view shows the neutral generic Quad frame.

---

## 7. Component Catalog (`src/data/*`)

All datasets are plain TypeScript arrays. IDs are unique within each category; display names do not have to be globally unique.

### 7.1 Frames (`frames.ts`)

| ID | Name | Mass, kg | Allowed rotors | Max payload, kg | MTOW, kg | Max propeller, in |
|---|---|---:|---|---:|---:|---:|
| `frame-aster-450` | Aster 450 | 0.45 | 4 | 1 | 3.2 | 12 |
| `frame-aster-680` | Aster 680 | 1.2 | 4, 6 | 3 | 7.5 | 18 |
| `frame-aster-960` | Aster 960 | 2.8 | 4, 6, 8 | 8 | 18 | 24 |

### 7.2 Motors (`motors.ts`)

| ID | Name | Mass, kg | Umin, V | Umax, V | Avg current, A | Max current, A | Thrust, kgf |
|---|---|---:|---:|---:|---:|---:|---:|
| `motor-m2216` | M2216 880KV | 0.075 | 11.1 | 16.8 | 6 | 18 | 0.85 |
| `motor-m2814` | M2814 700KV | 0.105 | 11.1 | 25.2 | 9 | 25 | 1.3 |
| `motor-m3110` | M3110 650KV | 0.13 | 14.8 | 25.2 | 11 | 32 | 1.7 |
| `motor-m3508` | M3508 580KV | 0.17 | 14.8 | 25.2 | 13 | 38 | 2.2 |
| `motor-m4012` | M4012 400KV | 0.26 | 18.5 | 33.6 | 17 | 48 | 3.2 |
| `motor-m5010` | M5010 320KV | 0.35 | 22.2 | 50.4 | 20 | 60 | 4.5 |
| `motor-m6215` | M6215 170KV | 0.58 | 29.6 | 50.4 | 26 | 75 | 6.5 |

Voltage ranges overlap; mass, current, and thrust distinguish the choices.

### 7.3 Propellers (`propellers.ts`)

| ID | Name | Mass, kg | Diameter, in | Pitch, in |
|---|---|---:|---:|---:|
| `propeller-p9045` | P9045 | 0.015 | 9 | 4.5 |
| `propeller-p1045` | P1045 | 0.02 | 10 | 4.5 |
| `propeller-p1240` | P1240 | 0.028 | 12 | 4 |
| `propeller-p1555` | P1555 | 0.045 | 15 | 5.5 |
| `propeller-p1860` | P1860 | 0.065 | 18 | 6 |
| `propeller-p2480` | P2480 | 0.12 | 24 | 8 |

### 7.4 ESCs (`escs.ts`)

| ID | Name | Topology | Mass, kg | Umin, V | Umax, V | Cont. current, A/ch | Peak current, A/ch |
|---|---|---|---:|---:|---:|---:|---:|
| `esc-v25` | V25 4-in-1 | `4in1` | 0.025 | 9 | 16.8 | 25 | 35 |
| `esc-v40` | V40 | `individual` | 0.04 | 11.1 | 25.2 | 40 | 55 |
| `esc-v55` | V55 | `individual` | 0.055 | 11.1 | 33.6 | 55 | 70 |
| `esc-v70` | V70 | `individual` | 0.08 | 14.8 | 50.4 | 70 | 90 |
| `esc-v90` | V90 | `individual` | 0.115 | 18.5 | 50.4 | 90 | 120 |
| `esc-v110` | V110 | `individual` | 0.16 | 22.2 | 50.4 | 110 | 140 |

### 7.5 Batteries (`batteries.ts`)

| ID | Name | Mass, kg | Voltage, V | Capacity, Ah | Max continuous current, A |
|---|---|---:|---:|---:|---:|
| `battery-b4-4000` | B4 4000 | 0.4 | 14.8 | 4 | 110 |
| `battery-b4-6000` | B4 6000 | 0.58 | 14.8 | 6 | 160 |
| `battery-b6-5000` | B6 5000 | 0.72 | 22.2 | 5 | 200 |
| `battery-b6-10000` | B6 10000 | 1.35 | 22.2 | 10 | 320 |
| `battery-b8-12000` | B8 12000 | 2.05 | 29.6 | 12 | 400 |
| `battery-b12-16000` | B12 16000 | 3.9 | 44.4 | 16 | 640 |

### 7.6 Electronics (`electronics.ts`)

| ID | Name | Category | Required | Mass, kg | Average power, W | Operating voltage, V |
|---|---|---|---:|---:|---:|---:|
| `electronics-flight-controller` | Flight Controller | control | yes | 0.05 | 3 | 5 |
| `electronics-gnss` | GNSS Module | navigation | yes | 0.035 | 1.5 | 5 |
| `electronics-rc-receiver` | RC Receiver | communication | yes | 0.018 | 0.8 | 5 |
| `electronics-camera` | Camera | imaging | no | 0.12 | 6 | 12 |
| `electronics-thermal-camera` | Thermal Camera | imaging | no | 0.28 | 12 | 12 |
| `electronics-gimbal` | Gimbal | stabilization | no | 0.48 | 18 | 12 |
| `electronics-lidar` | LiDAR | sensing | no | 0.25 | 28 | 24 |

`operatingVoltage` is stored but is not currently used by calculations or validation.

---

## 8. Calculations (`src/configurator/calculator.ts`)

### 8.1 Constants and Conventions

```ts
export const BATTERY_RESERVE_RATIO = 0.20;
```

- 20% of battery energy is treated as an unavailable reserve.
- All functions are resilient to `undefined`, `NaN`, `Infinity`, and negative values. Invalid numbers are usually treated as 0, and impossible results are returned as `undefined`.
- A valid rotor count must be a positive integer.

### 8.2 Helpers

| Function | Purpose |
|---|---|
| `validNonNegative(value)` | Returns the value if finite and `>= 0`, otherwise 0. |
| `getRotorCount(configuration)` | Returns `rotorCount` if it is an integer `> 0`, otherwise `undefined`. |
| `calculateEscQuantity(esc, rotorCount)` | `0` without ESC; `1` for `4in1`; `rotorCount` for `individual` (or `0` if the count is unknown). |
| `calculateElectronicsPowerW(configuration)` | Sum of `averagePowerW` for all selected electronics; invalid values contribute 0. |

### 8.3 Mass

```text
totalMass =
    frame.weightKg
  + motor.weightKg × N
  + propeller.weightKg × N
  + esc.weightKg × escQuantity
  + Σ electronics.weightKg
  + battery.weightKg
  + payloadKg
```

- `N` is the rotor count; if missing or invalid, it is 0.
- ESC mass is multiplied by physical quantity: one 4-in-1 or `N` individual units.
- If the result is not finite, 0 is returned.

### 8.4 Thrust and Thrust-to-Weight

```text
totalThrustKg = motor.maxThrustKg × N
thrustToWeight = totalThrustKg / totalMass
```

- `totalThrustKg` is returned only when a motor is selected, `N` is valid, and `maxThrustKg` is finite and `> 0`.
- `thrustToWeight` is returned only when mass is `> 0`.
- Thrust is in kgf and mass in kg, so the ratio is dimensionless.

### 8.5 Required Voltage Range

```text
requiredMin = max(motor.minVoltage, esc.minVoltage)
requiredMax = min(motor.maxVoltage, esc.maxVoltage)
```

- `undefined` if only the motor or only the ESC is selected.
- The range may be inverted (`min > max`); validation reports this separately.

### 8.6 Current and Power

| Field | Formula / condition |
|---|---|
| `motorAverageCurrent` | `motor.averageCurrent × N` when the motor and `N` exist |
| `motorMaxCurrent` | `motor.maxCurrent × N` when the motor and `N` exist |
| `electronicsPowerW` | Sum of electronics `averagePowerW` |
| `electronicsCurrent` | `electronicsPowerW / battery.voltage` when battery voltage is finite and `> 0` |
| `totalAverageCurrent` | `motorAverageCurrent + electronicsCurrent` only when both are defined |
| `totalMaxCurrent` | `motorMaxCurrent + electronicsCurrent` only when both are defined |
| `averagePowerW` | `battery.voltage × totalAverageCurrent` when the battery is valid |

Important: `CurrentPowerCalculations.averagePowerW` is power at average current, while `BasicPerformanceSummary.averagePowerW` is the **estimated hover power** described below. They are different quantities with the same field name in different interfaces.

### 8.7 Estimated Hover Power

`calculateEstimatedHoverPowerW` requires:

- a selected battery and motor;
- a valid `rotorCount`;
- `totalMassKg > 0`;
- `totalThrustKg > 0`;
- `battery.voltage > 0`;
- `motor.maxCurrent > 0`;
- all `electronics.averagePowerW` values finite and `>= 0`.

Formula:

```text
hoverThrustFraction = totalMassKg / totalThrustKg
```

If `hoverThrustFraction >= 1`, the function returns `undefined`: maximum thrust is not enough even theoretically.

```text
maxPropulsionPowerW = battery.voltage × motor.maxCurrent × N
propulsionPowerFraction = hoverThrustFraction ^ 1.5
estimatedHoverPowerW = maxPropulsionPowerW × propulsionPowerFraction
                     + electronicsPowerW
```

This is a simplified rotorcraft model, not a motor/propeller simulation. It does not account for propeller efficiency, blade profile, air density, altitude, temperature, etc.

### 8.8 Energy and Flight Time

```text
batteryEnergyWh = battery.voltage × battery.capacityAh
usableBatteryEnergyWh = batteryEnergyWh × (1 − 0.20)
estimatedFlightTimeMinutes =
    (usableBatteryEnergyWh / estimatedHoverPowerW) × 60
```

- Energy is returned only for positive finite voltage and capacity.
- Flight time is returned only for positive usable energy and hover power.

### 8.9 Summary

`calculateBasicSummary(configuration)` returns:

| Field | Source |
|---|---|
| `totalMassKg` | `calculateTotalMass` |
| `requiredVoltageMin` / `requiredVoltageMax` | `calculateRequiredVoltageRange` |
| `averageCurrentA` | `totalAverageCurrent` |
| `maximumCurrentA` | `totalMaxCurrent` |
| `averagePowerW` | `calculateEstimatedHoverPowerW` |
| `batteryEnergyWh` | `calculateBatteryEnergyWh` |
| `usableBatteryEnergyWh` | `calculateUsableBatteryEnergyWh` |
| `estimatedFlightTimeMinutes` | `calculateEstimatedFlightTimeMinutes` |
| `totalThrustKg` | `calculateTotalThrustKg` |
| `thrustToWeight` | `calculateThrustToWeight` |

### 8.10 Numeric Example from Tests

For a configuration with 4 kg mass, 8 kgf total thrust, 1000 W maximum propulsion power, and 10 W electronics:

```text
hover fraction = 4 / 8 = 0.5
0.5^1.5 ≈ 0.3535533905932738
P_hover ≈ 1000 × 0.3535533905932738 + 10 = 363.5533905932738 W
```

With a 10 V × 10 Ah = 100 Wh battery and a 20% reserve:

```text
t = (80 / 363.5533905932738) × 60 ≈ 13.20 min
```

`tests/flight-time.mjs` checks these values to `1e-9`.

---

## 9. Validation (`src/configurator/validator.ts`)

### 9.1 Message Format

```ts
type ValidationLevel = 'valid' | 'warning' | 'error';

interface ValidationMessage {
  level: ValidationLevel;
  code: string;
  message: string;
}
```

`valid` is not used by current rules; `validateConfiguration` returns only `warning`/`error` messages or an empty array.

### 9.2 Frame Limits (`validateFrameLimits`)

Only runs when a frame is selected:

| Condition | Level | Code |
|---|---|---|
| `payloadKg > frame.maxPayloadKg` | error | `frame-payload-exceeded` |
| `propeller.diameterInch > frame.maxPropellerDiameterInch` | error | `frame-propeller-diameter-exceeded` |
| `totalMass > frame.maxTakeoffWeightKg` | error | `frame-mtow-exceeded` |

Equality with limits is accepted. The propeller check runs only when a propeller is selected.

### 9.3 Voltage (`validateVoltageRequirements`)

| Condition | Level | Code |
|---|---|---|
| `motor` and `esc` exist but `requiredMin > requiredMax` | error | `motor-esc-voltage-incompatible` |
| battery voltage below `requiredMin` | error | `battery-voltage-too-low` |
| battery voltage above `requiredMax` | error | `battery-voltage-too-high` |

- Without a motor or ESC, the check returns an empty array.
- Without a battery, only motor/ESC compatibility is checked.
- Equality with boundaries is valid.

### 9.4 Current (`validateCurrentRequirements`)

| Condition | Level | Code |
|---|---|---|
| `motor.maxCurrent > esc.continuousCurrent` | error | `esc-continuous-current-too-low` |
| `totalMaxCurrent > battery.maxContinuousCurrent` | error | `battery-continuous-current-too-low` |

- ESC comparison uses **continuous** current; peak headroom is not checked.
- `totalMaxCurrent` includes electronics current and requires a battery with a valid voltage.

### 9.5 Thrust-to-Weight (`validateThrustToWeight`)

| `T/W` value | Level | Code |
|---|---|---|
| `< 1.0` | error | `thrust-to-weight-insufficient` |
| `>= 1.0` and `< 1.3` | warning | `thrust-reserve-very-low` |
| `>= 1.3` and `< 1.6` | warning | `thrust-reserve-moderate` |
| `>= 1.6` | — | no message |

If `T/W` cannot be calculated (missing motor/rotors/mass), an empty array is returned.

### 9.6 Full Validation

```ts
validateConfiguration(configuration) = [
  ...validateFrameLimits,
  ...validateVoltageRequirements,
  ...validateCurrentRequirements,
  ...validateThrustToWeight,
]
```

Message order is fixed: frame → voltage → current → thrust-to-weight.

---

## 10. Mission Recommendations (`recommendations.ts`)

### 10.1 Model

```ts
interface MissionRecommendation {
  level: 'info' | 'recommended' | 'warning';
  message: string;
}
```

- `mission === 'custom'` produces no recommendations.
- Before generating advice, the current validation issue codes are collected.
- Advice related to an already violated technical limit is suppressed.
- Duplicate messages are removed.
- Sorting priority: `warning` → `recommended` → `info`.
- Recommendations never mutate the configuration, calculations, or validation results.

### 10.2 Constants

```ts
AGRICULTURE_PAYLOAD_CAPACITY_KG = 5
AGRICULTURE_BATTERY_ENERGY_WH = 500
DELIVERY_PAYLOAD_CAPACITY_KG = 3
DELIVERY_PAYLOAD_RESERVE_RATIO = 0.8
DELIVERY_MTOW_RESERVE_RATIO = 0.85
DELIVERY_BATTERY_ENERGY_WH = 300
DELIVERY_THRUST_TO_WEIGHT = 1.8
PROFESSIONAL_FLIGHT_TIME_MINUTES = 15
PROFESSIONAL_BATTERY_ENERGY_WH = 200
PROFESSIONAL_EQUIPMENT_IDS = ['electronics-camera',
  'electronics-thermal-camera', 'electronics-lidar']
```

`hasBatteryIssue(issues)` treats these as battery-related:

- `battery-voltage-too-low`
- `battery-voltage-too-high`
- `battery-continuous-current-too-low`
- `motor-esc-voltage-incompatible`

### 10.3 Agriculture

| Condition | Level | Message |
|---|---|---|
| `frame.maxPayloadKg < 5` and no `frame-payload-exceeded` | recommended | Consider a frame with higher payload capacity for agricultural use. |
| Frame allows 6 or 8 rotors and no `thrust-to-weight-insufficient` | info | Six or eight rotors can help lift heavier agricultural payloads. |
| Battery energy `< 500 Wh` and no battery issue | recommended | Consider a higher-energy battery for agricultural missions. |

Boundaries are inclusive: 5 kg and 500 Wh no longer trigger advice. Full battery energy is used, not usable energy.

### 10.4 Delivery

| Condition | Level | Message |
|---|---|---|
| `frame.maxPayloadKg < 3` and no `frame-payload-exceeded` | recommended | Consider a frame with higher payload capacity for delivery missions. |
| `payloadKg > 0.8 × maxPayloadKg`, no `frame-payload-exceeded`, and `maxPayloadKg >= 3` | recommended | Consider more payload capacity for a larger delivery reserve. |
| `totalMass > 0.85 × maxTakeoffWeightKg` and no `frame-mtow-exceeded` | recommended | Consider a higher takeoff weight limit for more delivery reserve. |
| Battery energy `< 300 Wh` and no battery issue | recommended | Consider a higher-energy battery for delivery missions. |
| `T/W < 1.8` and no `thrust-to-weight-insufficient`, `thrust-reserve-very-low`, or `thrust-reserve-moderate` | recommended | A higher thrust reserve is recommended for delivery missions. |
| `rotorCount === 4`, frame allows 6 or 8, no `thrust-to-weight-insufficient` | info | Six or eight rotors can help lift heavier delivery payloads. |

### 10.5 Professional

`optionalIds` contains IDs of selected non-required electronics only.

| Condition | Level | Message |
|---|---|---|
| No camera, thermal camera, or LiDAR among optional electronics | recommended | Consider a camera, thermal camera or LiDAR for professional missions. |
| Camera is present but `electronics-gimbal` is not | recommended | Consider a gimbal for steadier camera images. |
| Flight time `< 15 min`, energy `>= 200 Wh`, no battery issue | recommended | Consider reducing weight or power use for longer professional flights. |
| Energy `< 200 Wh` and no battery issue | recommended | Consider a higher-energy battery for professional missions. |

At low energy, the generic endurance advice is replaced by the more specific battery advice. Mission equipment is recognized by stable ID, not display name. A gimbal alone does not count as mission equipment.

---

## 11. Rotor Selection (`frameSelection.ts`)

```ts
resolveRotorCount(frame, requested, autoSelectSingle = true)
```

Logic:

1. No frame → `undefined`.
2. `requested` is in `frame.allowedRotorCounts` → return it.
3. Otherwise, if `autoSelectSingle === true` and the frame has exactly one allowed count → return it.
4. Otherwise → `undefined`.

Usage:

- **UI** (`main.ts`) uses the default `autoSelectSingle = true`: Aster 450 immediately selects 4 rotors.
- **3D layer** (`frameModels.ts`) passes `false`: if the user has not chosen a count yet, the viewer must not assume a Quad layout; it loads the frame base asset.

Tests verify that an incompatible request (for example, 8 for Aster 680) returns `undefined` rather than the nearest value.

---

## 12. User Interface (`src/main.ts` + `customSelect.ts`)

### 12.1 Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Header: DC · Drone Configurator · Interactive multirotor...         │
├──────────────────────┬──────────────────────────┬────────────────────┤
│ Configuration        │ 3D View                  │ Configuration      │
│ (left column)        │ (center, Three.js)       │ Parameters         │
│                      │                          │ (right column)     │
│ Mission              │ toolbar + assembly       │ Summary            │
│ 01 Airframe          │ controls                 │ Mission            │
│ 02 Propulsion        │                          │ Total mass         │
│ 03 Electronics       │                          │ Flight time        │
│ 04 Load              │                          │ T/W, currents, ... │
│                      │                          │ Status + messages  │
│                      │                          │ Mission advice     │
└──────────────────────┴──────────────────────────┴────────────────────┘
```

At `<= 950px`, the right column moves below and spans the full width; at `<= 700px`, everything becomes one column; at `<= 460px`, spacing and 3D height are reduced further.

### 12.2 Form Elements

| ID | Purpose | Source |
|---|---|---|
| `mission` | Mission selection | 4 fixed options |
| `frame` | Frame | `frames` |
| `rotor-count` | Rotor count | Depends on frame; initially disabled |
| `motor` | Motor | `motors` |
| `propeller` | Propeller | `propellers` |
| `esc` | ESC | `escs` |
| `battery` | Battery | `batteries` |
| `payload` | Payload in grams | Number input, `min=0`, `step=1` |
| `required-electronics-list` | Required electronics | `electronics.filter(required)` |
| `optional-electronics-list` | Optional electronics | Checkboxes |

Each component select gets a placeholder `Select <label>` with an empty value. An empty value clears the corresponding configuration field (`undefined`).

### 12.3 Build Progress

- `#build-progress-value` displays `N / 6`.
- Six selects are counted: `frame`, `rotor-count`, `motor`, `propeller`, `esc`, `battery`.
- A select counts as filled when its `value` is non-empty.
- `#build-progress-fill` and `aria-valuenow` update on the form `change` event.
- Because Aster 450 auto-selects 4 rotors, selecting the frame immediately changes progress to `2 / 6`.

### 12.4 Summary Parameters

`dd` elements:

| ID | Content | Format |
|---|---|---|
| `mission-summary` | Mission name | String |
| `total-mass` | Mass | `X.XX kg` |
| `estimated-flight-time` | Flight time | `X.X min` or `--` |
| `thrust-to-weight` | T/W | `X.XX` or `--` |
| `thrust-performance` | Qualitative rating | See below |
| `average-current` | Average current | `X.X A` or `--` |
| `maximum-current` | Maximum current | `X.X A` or `--` |
| `average-power` | Estimated hover power | `X.X W` / `X.XX kW` |
| `battery-energy` | Full energy | Wh / kWh |
| `usable-battery-energy` | Usable energy (80%) | Wh / kWh |
| `total-thrust` | Total thrust | `X.XX kg` |
| `required-voltage` | Voltage range | `X.X–X.X V` |
| `validation-status` | Status | `Valid` / `Warning` / `Invalid` |
| `validation-messages` | Message list | `<li class="warning|error">` |

Power formatting: `>= 1000 W` → kW with two decimals. Energy: `>= 1000 Wh` → kWh; otherwise whole Wh with no decimals, or one decimal when non-integer.

Qualitative `thrust-performance`:

| T/W | Label |
|---|---|
| `< 1.0` | Insufficient |
| `1.0 … < 1.3` | Very low |
| `1.3 … < 1.6` | Moderate |
| `1.6 … < 2.0` | Good |
| `>= 2.0` | High |
| No value | `--` |

### 12.5 Status

```text
messages = validateConfiguration(configuration) excluding level === 'valid'
hasError   = any message with level error
hasWarning = any message with level warning

status = hasError ? 'Invalid' : hasWarning ? 'Warning' : 'Valid'
```

Status dot CSS classes:

- `valid` — green;
- `invalid` — red;
- `warning` — yellow.

Errors take priority over warnings. An empty configuration is also `Valid` because checks simply do not run; this is expected prototype behavior.

### 12.6 Mission

Changing the mission:

- updates `configuration.mission`;
- updates `mission-summary`;
- recalculates recommendations;
- does not recalculate other parameters or status, because mission does not affect calculations;
- shows recommendations in the separate `#mission-recommendations` panel, hidden when empty.

### 12.7 Payload

- UI accepts grams.
- State stores `payloadKg = grams / 1000`.
- Empty or non-numeric input becomes 0.
- Negative values reset the input to `0`.
- Updates on the `input` event (unlike selects, which use `change`).

### 12.8 Electronics

- Required components are already in `configuration.electronics` and rendered with a `Required` label; the UI cannot remove them.
- Optional components are checkboxes with `name="optional-electronics"` and an ID value.
- Checking adds the component if not already present.
- Unchecking removes the component but keeps all `required` ones.
- Any change immediately recalculates the summary.
- There are no 3D models for electronics.

### 12.9 Updating 3D from the UI

| Action | Scene call |
|---|---|
| Select frame | `setDroneFrame(rotorCount, frameId)` |
| Change rotor count | `setDroneFrame(rotorCount, frameId)` |
| Select motor | `setSelectedMotor(motorId)` |
| Select propeller | `setSelectedPropeller(propellerId)` |
| Select ESC | `setSelectedEsc(escId)` |
| Select battery | `setSelectedBattery(batteryId)` |
| Mission / payload / electronics | No 3D change |

### 12.10 Full Assembly Controls

The `#assembly-actions` panel is visible only for `frame-aster-450` + `rotorCount === 4`.

| Element | Behavior |
|---|---|
| `#assembly-open` | "Play assembly"; hidden during loading/playing/paused/complete |
| `#assembly-pause` | `Pause` / `Resume`; hidden after completion; disabled while loading |
| `#assembly-restart` | `Restart` / `Replay`; disabled while loading |
| `#assembly-exit` | "Back to configurator"; disabled while loading |
| `#assembly-status` | Status text |

Status texts:

| Status | Text |
|---|---|
| `idle` | empty |
| `loading` | `Loading assembly…` |
| `playing` | `Aster 450 — Assembly` |
| `paused` | `Assembly paused` |
| `complete` | `Assembly complete` |
| `error` | `Assembly could not load. Try again.` |

### 12.11 Custom Select (`src/ui/customSelect.ts`)

`enhanceSelects(document)` finds every `select` inside `.configuration-form` and replaces it with a custom combobox. The native select stays in the DOM as a hidden value/event source.

Implemented behavior:

- Trigger button with `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, and `aria-controls`.
- Menu with `role="listbox"`; options with `role="option"`, `aria-selected`, and `data-value`.
- Menu is appended to `document.body` with `position: fixed` so panels cannot clip it.
- Opens upward when there is not enough space below.
- Height limiting and scrolling.
- Keyboard support:
  - `ArrowUp` / `ArrowDown` — open/navigate;
  - `Home` / `End` — first/last option;
  - `Enter` / `Space` — open/select;
  - `Escape` — close and restore focus;
  - `Tab` — close;
  - printable characters — 500 ms typeahead.
- Closes on outside pointerdown, panel scroll, and window resize.
- Syncs through `MutationObserver` because options can be rebuilt when the frame changes.
- Selecting an option sets `select.value` and dispatches a bubbling `change` event, so normal handlers keep working.
- Native disabled state is mirrored to the trigger (important for `rotor-count`).

---

## 13. CSS and Visual Design (`src/style.css`)

- Dark theme: background `#090d13`, panels `#111721` / gradients, blue accents `#3c82f6` / `#438fff`, text `#e7edf7`.
- Font stack: `Inter, ui-sans-serif, system-ui, ...`.
- `body` has a radial gradient in the upper-right corner.
- `.app-shell` is a full-height flex column (`100dvh`).
- `.workspace` is a three-column CSS Grid:
  `clamp(250px, 17vw, 320px) minmax(0, 1fr) clamp(280px, 23vw, 380px)`.
- Panels have a `#202a38` border, 14 px radius, shadow, and `overflow: hidden`; left and right panels scroll independently.
- Decorative elements: `DC` brand mark, diamond pattern in the configuration heading, circular Summary marker, gradient top strips.
- Progress bar: 4 px, blue-to-cyan gradient, 180 ms width animation.
- Custom select: dark gradient, status dot, chevron, separate menu with a checkmark on the selected option.
- Electronics checkboxes are styled with `appearance: none` and pseudo-elements.
- Parameter grid: two columns, eight rows; highlighted cards for mass/flight time/T/W/performance; full-width status card with scrollable messages.
- Responsive rules:
  - `<= 950px`: two columns, right panel full width, four-column parameter grid;
  - `<= 700px`: one column, 430 px 3D area, two-column parameter grid;
  - `<= 460px`: single-column checkboxes, 360 px 3D area.
- There is no light theme.

Screenshots at the repository root:

| File | Size | Content |
|---|---|---|
| `img.png` | 1976×1181 | General view: Aster 450, 4 rotors, motor selected, empty propeller/ESC/battery, Summary and Professional advice |
| `img_1.png` | 2557×1261 | Initial screen with an empty configuration and neutral Quad frame |
| `img_2.png` | 432×427 | Summary panel fragment |
| `img_3.png` | 347×1272 | Full left Configuration panel |

---

## 14. 3D Subsystem

### 14.1 Scene Initialization (`scene.ts`)

`initializeScene(container, initialRotorCount?, initialFrameId?)`:

- creates a `THREE.Scene` with background `0x0b1018` and `Fog(0x0b1018, 10, 24)`;
- creates `PerspectiveCamera(45, 1, 0.1, 100)` at `(4.5, 3.4, 5.5)`;
- creates `WebGLRenderer({ antialias: true })`, `pixelRatio = min(devicePixelRatio, 2)`, sRGB output, PCFSoftShadowMap;
- adds `HemisphereLight(0xbfd8ff, 0x202735, 1.8)`;
- adds `DirectionalLight(0xffffff, 2.4)` at `(4, 7, 3)` with shadows;
- adds `GridHelper(12, 24, 0x3c82f6, 0x263140)` at `y = -0.51`;
- creates `OrbitControls` from `controls.ts`:
  - damping 0.06;
  - min/max distance 3/14 (later recalculated for the model);
  - `maxPolarAngle = π × 0.48`;
  - target `(0, 0.35, 0)`.

### 14.2 Camera Framing

`frameModel(resetView)`:

- reads the model bounding box;
- computes center and bounding-sphere radius;
- accounts for vertical and horizontal FOV;
- `fitDistance = radius / sin(min(fov)/2) × 1.2`;
- on `resetView`, positions the camera along `(4.5, 3.4, 5.5)`; otherwise preserves the current direction;
- updates `controls.target`, `minDistance = radius × 1.2`, `maxDistance = max(14, distance × 3)`, near/far;
- runs on model load, resize, and assembly exit.

### 14.3 Loading and Caches

| Cache | Key | Value |
|---|---|---|
| `modelCache` | Frame path | `Promise<Group>` |
| `motorCache` | Motor path | `Promise<Group>` |
| `escCache` | ESC path | `Promise<Group>` |
| `batteryCache` | Battery path | `Promise<Group>` |
| `propellerCache` | Propeller/cap path | `Promise<Group>` |
| `assemblyCache` | Animation path | `Promise<GLTF>` |

Rules:

- requesting the same path again returns the cached promise;
- failures remove the cache entry so loading can be retried;
- cached templates are cloned with `clone(true)`, so instance transforms do not corrupt the cache;
- cloned GLB geometry/materials are shared and not disposed; the procedural fallback disposes its own geometry/materials when replaced.

### 14.4 Model Resolution

#### Frames (`frameModels.ts`)

For `frame-aster-450`:

| Condition | GLB | Anchors |
|---|---|---|
| No layout selected / incompatible | `/models/frames/aster-450/aster_450_base.glb` | `SmallQuad_CameraMount`, `SmallQuad_AntennaMount` |
| 4 rotors | `/models/frames/aster-450/aster_450_quad.glb` | 7 anchors: `SmallQuad_MotorMount_01..04`, `SmallQuad_CameraMount`, `SmallQuad_AntennaMount`, `SmallQuad_BatteryMount` |

Other/unknown frames use `genericFrames`:

| Layout | GLB |
|---|---|
| 4 | `/models/quad_frame.glb` |
| 6 | `/models/hexa_frame.glb` |
| 8 | `/models/octo_frame.glb` |
| Not selected | `/models/quad_frame.glb` (base) |

`resolveFrameModel(frameId, rotorCount)`:

1. Finds the frame in the catalog.
2. Resolves the layout with `resolveRotorCount(frame, rotorCount, false)`.
3. If the layout is explicit, returns its path and `rotorCount`.
4. Otherwise returns the base asset and `rotorCount: undefined`.

Missing anchors do not break loading: the scene logs `console.warn` with missing names.

The central `SmallQuad_ESCMount` is not in the anchors list but is used directly during ESC installation.

#### Motors (`motorModels.ts`)

| ID | GLB |
|---|---|
| `motor-m2216` | `/models/motors/small/small_motor_open.glb` |
| `motor-m2814` | `/models/motors/small/small_motor_closed.glb` |
| Others | `undefined` (no 3D model) |

#### Propellers (`propellerModels.ts`)

| ID | CW | CCW |
|---|---|---|
| `propeller-p9045` | `/models/propellers/small/small_propeller_cw.glb` | `/models/propellers/small/small_propeller_ccw.glb` |

- `PROPELLER_CAP_PATH = /models/propellers/small/small_prop_retaining_cap.glb`.
- `ASTER_PROPELLER_HANDEDNESS = ['cw', 'ccw', 'cw', 'ccw']`.
- Code comment: motors `01` lower left, `02` lower right, `03` upper right, `04` upper left.

#### ESCs (`escModels.ts`)

| ID | GLB |
|---|---|
| `esc-v25` | `/models/escs/small/small_esc_4in1.glb` |
| Others | `undefined` |

#### Batteries (`batteryModels.ts`)

| ID | GLB |
|---|---|
| `battery-b4-4000` | `/models/batteries/small/small_battery.glb` |
| Others | `undefined` |

#### Full Assembly (`assemblyModels.ts`)

| Condition | GLB |
|---|---|
| `frame-aster-450` + 4 rotors | `/models/animations/aster-450/aster450_full_assembly.glb` |
| Otherwise | `undefined` |

### 14.5 Procedural Fallback Model (`droneModel.ts`)

`createDroneModel(rotorCount)` accepts only 4, 6, or 8; otherwise it throws `RangeError`.

Parameters:

- `ARM_LENGTH = 1.7`;
- body `BoxGeometry(0.85, 0.28, 0.85)`;
- arm `BoxGeometry(1.7, 0.12, 0.14)`;
- motor `CylinderGeometry(0.14, 0.14, 0.24, 16)`;
- propeller `BoxGeometry(0.95, 0.035, 0.1)`;
- motors are evenly distributed on a circle, arms run from the center to the motors, propellers sit above the motors;
- all meshes receive `castShadow` and `receiveShadow`;
- materials: blue frame, gray motor, light propeller.

The fallback is used when the frame GLB fails to load. `replaceFrame` resets `requestedModelPath = undefined` so a later attempt can retry.

### 14.6 Component Mounting

General conditions for modular mounting:

- a current frame exists and is fully assembled;
- it is not a fallback;
- `currentFrameId === 'frame-aster-450'`;
- `currentRotorCount === 4`;
- loaded frame and rotor count match the current values;
- an approved GLB exists for the component.

If a condition fails, the function exits silently (with `console.warn` in some cases), and the readiness promise resolves.

#### Motors

- For each of the four anchors `SmallQuad_MotorMount_01..04`, a group `SmallQuad_Motor_01..04` is created.
- The GLB is cloned inside; the visual node is named `SelectedMotorVisual_XX`.
- The propeller anchor is renamed to `SmallQuad_MotorXX_PropellerMount`.
- All meshes receive shadows.
- Motors start hidden and become visible after animation preparation, or immediately when no clips are available.
- `motorAssembled` becomes `true` after mounting/animation, then propellers are mounted.

#### Propellers and Caps

- Requires an assembled frame, assembled motors, exactly four motors, Aster 450 + 4.
- For each motor, `SmallQuad_MotorXX_PropellerMount` is resolved.
- Created objects:
  - `SmallQuad_Propeller_XX` — root group with local `+Z` along the shaft (`x = -π/2` rotation), containing the CW/CCW visual;
  - `SmallQuad_PropNut_XX` — retaining cap, containing `SelectedPropNutVisual_XX` and mesh `SmallQuad_PropNut_XX_Mesh`.
- Visuals receive shadows.
- When animation is available, `preparePropellerInstallation` is used.
- Missing anchors produce a warning and no propellers.

#### ESC

- Uses the central `SmallQuad_ESCMount` anchor.
- Creates one group `SmallQuad_ESC_4in1` (not four separate ESCs).
- Visual is `SelectedEscVisual_4in1`.
- When animation is available:
  - `SmallQuad_TopPlate` becomes temporarily transparent (opacity 0.28, `depthWrite = false`), with cloned materials;
  - the camera temporarily focuses on the ESC mount (`minDistance = 0.08`) and is restored afterward.
- On completion or missing animation, materials/camera are restored and the next stage starts.

#### Battery

- Anchor: `SmallQuad_BatteryMount`.
- Group: `SmallQuad_Battery`; visual: `SelectedBatteryVisual`.
- One battery.
- Can trigger the next stage (motors) after completion.

#### Installation Chain

Selecting Aster 450 + 4 automatically starts:

```text
frame (arms + bolts)
  → ESC (if selected)
    → battery (if selected)
      → motor (if selected)
        → propeller (if selected)
```

Each stage waits for the previous one. If a component is not selected, its stage is skipped but the chain continues.

Direct component selection (without rebuilding the frame) mounts only that component and, when needed, dependents:

- an ESC without animation can immediately mount the selected battery;
- a motor mounts propellers after installation;
- the battery is not mounted while the ESC stage is active (`escStageActive`); it will be installed by the chain.

### 14.7 Selection Animations (`selectionAnimations.ts`)

Clips come from `aster450_full_assembly.glb` (a full timeline of roughly 48–50 seconds). The site does not play the entire source timeline; it plays compressed motion windows for each stage.

#### Clip Sets

| Set | Count | Names |
|---|---:|---|
| `FRAME_CLIP_NAMES` | 36 | 4 × `SmallQuad_ArmXX_Assembly` + 32 × `SmallQuad_ArmXX_Bolt_{Top,Bottom}_YY` |
| `MOTOR_CLIP_NAMES` | 4 | `SmallQuad_Motor_01..04` |
| `ESC_CLIP_NAMES` | 1 | `SmallQuad_ESC_4in1` |
| `BATTERY_CLIP_NAMES` | 1 | `SmallQuad_Battery` |
| `PROPELLER_CLIP_NAMES` | 12 | 4 propellers + 4 nuts + 4 nut meshes |

Camera clips are not part of selection animation.

#### Motion Analysis

`timing()`:

1. For each track, compares adjacent keys; a component change greater than `1e-6` counts as motion.
2. Collects motion intervals and merges overlapping/touching intervals.
3. `firstChange` is the start of the first interval; `lastChange` is the end of the last.
4. A leading idle interval `> 0.1 s` is replaced with `0.1 s`.
5. Each internal idle interval `> 0.75 s` is compressed to `0.25 s`.
6. `warp(time)` maps source time to compressed time.
7. `duration = warp(lastChange)`, `removedIdle = lastChange − duration`.

`analyzeMotion(clips, names)` returns the window without modifying clips.

`compactClips()`:

- requires every clip and non-empty tracks;
- trims tracks to `[firstChange, lastChange]`;
- moves the first key to `t = 0`;
- rewrites times through `warp`;
- drops non-increasing times;
- creates new `AnimationClip` objects with the window duration.

#### Playback

`createPlayback(root, clips)`:

- creates an `AnimationMixer`;
- each action uses `LoopOnce`, `clampWhenFinished = true`, and starts immediately;
- `update(delta)` advances time, applies `mixer.setTime`, stops at the end, and returns `true`;
- `seek(seconds)` clamps and applies time;
- `finish()` jumps to the end and stops;
- `cancel()` stops;
- `time` is read-only.

#### Stage Preparation

- `prepareFrameAssembly`:
  - verifies that static frame does not already contain runtime groups `SmallQuad_ArmXX_Assembly`;
  - creates those groups at final positions from the clips;
  - attaches `SmallQuad_Arm_XX`, `SmallQuad_MotorHousing_XX`, and `SmallQuad_HousingCollar_XX`;
  - verifies all 32 bolts;
  - returns playback and window.
- `prepareMotorInstallation`: verifies four runtime motor roots and trims clips.
- `prepareEscInstallation`: verifies `SmallQuad_ESC_4in1`.
- `prepareBatteryInstallation`: verifies `SmallQuad_Battery`.
- `preparePropellerInstallation`: verifies 12 runtime propeller/nut/mesh targets.

If a clip is missing or has no motion, an error is thrown; `scene.ts` catches it and places components in final positions.

### 14.8 Full Assembly Playback

`enterAssembly()`:

1. Verifies a GLB exists for the current frame/rotors.
2. Sets status to `loading`.
3. Completes all active selection animations (`completeFrameSelection`, `completeEscSelection`, etc.), awaiting the corresponding promises.
4. Loads or retrieves the full GLB from cache.
5. Verifies that the GLB contains animations.
6. Clones the scene and wraps it in `Aster450_AssemblyPresentation`.
7. Creates an `AnimationMixer` and actions for all clips; duration is the maximum clip duration.
8. Sets the mixer to the end, computes final bounds, centers the wrapper in X/Z, and places it on the grid in Y.
9. Sets the mixer to the start, computes the union of initial/final bounds, and fits the camera.
10. Hides the configuration frame, adds the wrapper, and starts playback from the beginning.
11. Sets `controls.enabled = false` during playback.

Details:

- Animation plays once; on completion status becomes `complete` and camera controls are re-enabled.
- Pause sets `action.paused`; camera control becomes available.
- Resume unpauses and disables camera control again.
- `seekAssembly(seconds)` clamps time, updates the mixer, and adjusts status.
- `exitAssembly()` stops the mixer, removes the wrapper, restores the current frame, recomputes bounds, resets the camera, and sets status to `idle`.
- On error, status becomes `error` and controls are enabled.

### 14.9 Render Loop

```ts
const delta = Math.min(clock.getDelta(), 0.1);

if (assemblyStatus === 'playing' && assemblyMixer) {
  assemblyMixer.update(delta);
  assemblyTime = Math.min(assemblyDuration, assemblyTime + delta);
  if (assemblyTime >= assemblyDuration) {
    assemblyMixer.setTime(assemblyDuration);
    controls.enabled = true;
    setAssemblyStatus('complete');
  }
} else if (!assemblyRoot && assemblyStatus !== 'loading') {
  if (frameMotion?.update(delta)) completeFrameSelection();
  if (escMotion?.update(delta)) completeEscSelection();
  if (batteryMotion?.update(delta)) completeBatterySelection();
  if (motorMotion?.update(delta)) completeMotorSelection();
  if (propellerMotion?.update(delta)) completePropellerSelection();
}

controls.update();
renderer.render(scene, camera);
```

- `delta` is capped at 0.1 s so animations do not jump after a tab is backgrounded.
- `renderer.setAnimationLoop(animate)` drives rendering.
- `ResizeObserver` watches the container; zero-size resizes are ignored.
- Each completed stage calls its `complete...Selection` handler.

### 14.10 Public Scene API

`initializeScene` returns:

| Member | Purpose |
|---|---|
| `scene`, `camera`, `renderer`, `controls` | Three.js access |
| `setDroneFrame(rotorCount, frameId)` | Load/change frame |
| `setSelectedEsc(id)` | Mount/remove ESC |
| `setSelectedBattery(id)` | Mount/remove battery |
| `setSelectedMotor(id)` | Mount/remove motors |
| `setSelectedPropeller(id)` | Mount/remove propellers |
| `enterAssembly()` | Start full assembly |
| `pauseAssembly()` / `resumeAssembly()` | Pause/resume |
| `restartAssembly()` | Restart assembly |
| `seekAssembly(seconds)` | Seek |
| `exitAssembly()` | Return to configurator |
| `seekSelectionAnimation(seconds)` | Seek selection stage |
| `onAssemblyStatusChange(listener)` | Status subscription; calls immediately with current status |
| `assemblyStatus` | Current status |
| `assemblyDuration`, `assemblyTime` | Full assembly duration/position |
| `modelReady` | Current frame promise |
| `motorReady`, `escReady`, `batteryReady`, `propellerReady` | Stage promises |
| `selectionAnimationPhase` | `frame` / `esc` / `battery` / `motor` / `propeller` / `idle` |
| `selectionAnimationTime` | Current stage time |
| `frameSelectionDuration` | Last frame animation duration |
| `motorSelectionDuration`, `escSelectionDuration`, `batterySelectionDuration`, `propellerSelectionDuration` | Stage durations |

---

## 15. Assets

### 15.1 File Table

| Path | Size, bytes | Used by code | Purpose |
|---|---:|---|---|
| `public/models/quad_frame.glb` | 37,916 | yes | Generic Quad (4) |
| `public/models/hexa_frame.glb` | 55,288 | yes | Generic Hexa (6) |
| `public/models/octo_frame.glb` | 72,808 | yes | Generic Octo (8) |
| `public/models/frames/aster-450/aster_450_base.glb` | 189,076 | yes | Aster 450 without a selected layout |
| `public/models/frames/aster-450/aster_450_quad.glb` | 884,988 | yes | Aster 450, 4 rotors, static frame with anchors |
| `public/models/aster_450_base.glb` | 189,076 | no | Duplicate base in models root |
| `public/models/aster_450_quad.glb` | 454,612 | no | Legacy/alternate quad version |
| `public/models/motors/small/small_motor_open.glb` | 86,484 | yes | M2216 motor |
| `public/models/motors/small/small_motor_closed.glb` | 43,800 | yes | M2814 motor |
| `public/models/propellers/small/small_propeller_cw.glb` | 49,764 | yes | CW propeller |
| `public/models/propellers/small/small_propeller_ccw.glb` | 49,768 | yes | CCW propeller |
| `public/models/propellers/small/small_prop_retaining_cap.glb` | 4,088 | yes | Propeller retaining cap |
| `public/models/escs/small/small_esc_4in1.glb` | 174,148 | yes | Central 4-in-1 ESC |
| `public/models/escs/small/small_esc.glb` | 114,460 | no | Single ESC, not used |
| `public/models/batteries/small/small_battery.glb` | 62,244 | yes | B4 4000 battery |
| `public/models/animations/aster-450/aster450_full_assembly.glb` | 3,442,668 | yes | Full timeline and stage clips |
| `public/models/animations/aster-450/aster450_propeller_assembly.glb` | 2,787,624 | no | Separate propeller stage asset |
| `public/models/animations/aster-450/aster450_esc_assembly.glb` | 3,176,096 | no | Separate ESC stage asset |
| `public/models/animations/aster-450/aster450_battery_assembly.glb` | 3,442,668 | no | Separate battery stage asset |
| `src/models/quad_frame.glb` | 37,916 | no | Copy of generic Quad |
| `src/models/hexa_frame.glb` | 55,288 | no | Copy of generic Hexa |
| `src/models/octo_frame.glb` | 72,808 | no | Copy of generic Octo |

### 15.2 Node Naming Conventions

From code and tests:

**Aster 450 frame / assembly**

- `SmallQuad_MotorMount_01..04`
- `SmallQuad_Motor_01..04`
- `SmallQuad_MotorXX_PropellerMount`
- `SmallQuad_ArmXX_Assembly`
- `SmallQuad_Arm_XX`, `SmallQuad_MotorHousing_XX`, `SmallQuad_HousingCollar_XX`
- `SmallQuad_ArmXX_Bolt_{Top|Bottom}_YY`
- `SmallQuad_ESCMount` — one central mount
- `SmallQuad_ESC_4in1`
- `SmallQuad_BatteryMount`
- `SmallQuad_Battery`
- `SmallQuad_Propeller_01..04`
- `SmallQuad_PropNut_01..04`, `SmallQuad_PropNut_XX_Mesh`
- `SmallQuad_TopPlate`
- `SmallQuad_CameraMount`, `SmallQuad_AntennaMount`

**ESC GLB**

- `SmallESC_4in1_Assembly`
- `SmallESC_Mount`
- `SmallESC_HeatSink`
- `SmallESC_Power_Positive`, `SmallESC_Power_Negative`
- `SmallESC_MotorXX_Phase_{A,B,C}` — 12 outputs

**Battery GLB**

- `SmallBattery_Assembly`
- `SmallBattery_Body`
- `SmallBattery_Label`
- `SmallBattery_Cable_Positive`, `SmallBattery_Cable_Negative`
- `SmallBattery_Connector`
- `SmallBattery_Mount`
- `SmallBattery_Positive`, `SmallBattery_Negative`

**Propeller GLBs** — one root node each:

- `SmallProp_CW`
- `SmallProp_CCW`
- `SmallProp_RetainingNut`

**Generic frames** — nodes `Quad_Body`, `Hexa_Body`, `Octo_Body` (checked by UI tests).

### 15.3 Asset Storage Note

All 3D assets are now tracked in Git under `public/models/`. `src/models/*.glb` are legacy copies and are kept only to document the earlier layout. Generated `dist/` output and `node_modules/` are ignored.

---

## 16. Tests

### 16.1 Unit/Integration Tests (`npm test`)

Run with `node --test tests/*.mjs`. TypeScript is bundled in memory by `esbuild`; no browser or dev server is required.

| File | Coverage |
|---|---|
| `tests/data-sanity.mjs` | Dataset integrity: IDs/names, finite numbers, masses, limits, unique IDs, rotor counts; negative control cases |
| `tests/flight-time.mjs` | Mass, thrust, power, flight time; payload/battery/accessory effects; numeric formula; missing and invalid inputs |
| `tests/validation.mjs` | Every error code and boundary; equality with limits; all 64 partial configurations; no mutation |
| `tests/recommendations.mjs` | All three missions, thresholds, suppression by errors, uniqueness/order, independence from state and validation |
| `tests/drone-model.mjs` | Procedural model for 4/6/8: geometry, positions, shadows, finite coordinates, rejection of unsupported values |
| `tests/frame-selection.mjs` | `resolveRotorCount` and `resolveFrameModel`: auto-selection, incompatible layouts, base/quad, generic Quad/Hexa/Octo |
| `tests/esc-topology.mjs` | Physical ESC quantity, 4-in-1 vs individual mass, per-channel current |
| `tests/selection-motion.mjs` | Clip set composition, no motors/camera in frame set, idle compression, window calculation |
| `tests/assembly-assets.mjs` | GLB header/JSON parsing: required nodes, no extra nodes, static assets without animations, clip names and durations |

Current test run (November 2, 2026):

```text
tests 94
pass 94
fail 0
duration ≈ 1.2 s
```

`npm run typecheck` also passes without errors.

### 16.2 Browser Tests (`npm run test:ui`)

Runner `tests/ui/smoke.mjs`:

1. For each page, finds a browser:
   - `CHROME_PATH`, if set;
   - Windows: Chrome, Edge;
   - Linux: `chromium`, `chromium-browser`, `google-chrome`;
   - macOS: Google Chrome.
2. Creates a temporary profile in `os.tmpdir()` with the prefix `drone-ui-smoke-`.
3. Starts a Vite server on `127.0.0.1` with a random port.
4. Launches headless browser with `--dump-dom`, `--virtual-time-budget`, and `--timeout`.
5. Looks for `<pre id="smoke-result">PASS: ...</pre>` in the output.
6. In `finally`, closes the server and removes the profile after verifying it is inside the temp directory.

Pages:

| Page | Coverage | Test timeout / budget |
|---|---|---|
| `index.html` (UI) | All selects/options, missions, required/optional electronics, payload, Summary, statuses, recommendations for all missions, Quad/Hexa/Octo switching | 45 s / 5 s |
| `model-loading.html` | Real GLB loading, 4→6→8→4 switching, cache, races, scale, camera/lights/grid preservation, OrbitControls, resize, fallback and retry | 45 s / 5 s |
| `small-quad.html` | Aster 450: only 4 rotors, auto-selection, base vs quad, 7 anchors, no components, generic frames, cache, late requests, missing anchors, fallback | 45 s / 5 s |
| `assembly.html` | Four modular motors, model switching, real animation, pause/resume/restart/complete/replay/exit, state preservation | 90 s / 50 s |
| `selection-animation.html` | Motor-free frame assembly, 32 bolts, exact final transforms, sequential motor installation, independent stages, cancellation | 90 s / 15 s |
| `propeller-selection.html` | Frame without propellers, propeller without motor, sequential CW/CCW and cap installation, anchors and `+Z`, motor replacement, races | 90 s / 15 s |
| `esc-selection.html` | Frame without ESC, one central ESC, motion into chassis, no four arm ESCs, power/phase anchors, independent stages | 90 s / 15 s |

Additional HTML files `esc-capture.html` and `esc-motion-capture.html` are **manual QA pages** for visual checks/screenshots of the central ESC. They are not part of the automated test list.

### 16.3 Test Infrastructure Notes

- Unit tests use `node:test`; `flight-time.mjs` performs top-level assertions and is counted as a file test.
- `esbuild` is a transitive Vite dependency, not a declared devDependency.
- Browser tests do not use Puppeteer/Playwright: they use the headless browser CLI and `--dump-dom`.
- UI tests check for absence of `console.error`, `console.warn`, `window.onerror`, and `unhandledrejection` in relevant scenarios.
- Tests read GLB files directly and parse the JSON chunk, verifying node names without loading Three.js.

---

## 17. Project Configuration

### 17.1 `package.json`

```json
{
  "name": "drone-configurator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.mjs",
    "test:ui": "node --test tests/ui/smoke.mjs",
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "three": "^0.179.1" },
  "devDependencies": {
    "@types/three": "^0.179.0",
    "typescript": "~5.9.2",
    "vite": "^7.1.3"
  }
}
```

### 17.2 `tsconfig.json`

| Option | Value |
|---|---|
| `target` | ES2022 |
| `module` | ESNext |
| `moduleResolution` | bundler |
| `lib` | ES2022, DOM, DOM.Iterable |
| `strict` | true |
| `noEmit` | true |
| `allowImportingTsExtensions` | true |
| `verbatimModuleSyntax` | true |
| `moduleDetection` | force |
| `noUnusedLocals` / `noUnusedParameters` | true |
| `noFallthroughCasesInSwitch` | true |
| `noUncheckedSideEffectImports` | true |
| `skipLibCheck` | true |
| `useDefineForClassFields` | true |
| `include` | `src` |

`tests/*.mjs` are not included in `tsconfig` and are not checked by `tsc`; they are plain JavaScript executed by Node.

### 17.3 `index.html`

- `lang="en"`;
- viewport and description meta tags;
- `<div id="app"></div>`;
- `<script type="module" src="/src/main.ts"></script>`.

### 17.4 Build Output

`npm run build` produces:

- `dist/index.html`;
- `dist/assets/index-*.js` — roughly 660 KB (Three.js + application);
- `dist/assets/index-*.css` — roughly 16.5 KB.

Hashes change on every build. `dist/`, `node_modules/`, and `.idea/` are ignored and not committed.

### 17.5 Repository Hygiene

- `.gitignore` excludes dependencies, build output, IDE workspace files, logs, and OS metadata.
- 3D models under `public/models/` are committed.
- Legacy copies under `src/models/` are committed for reference.
- The repository history is intentionally clean: no `node_modules` or `dist` blobs.

---

## 18. Known Limitations and Gaps

1. **Modular 3D mounting is only for Aster 450 + 4 rotors.** Aster 680/960 and other rotor counts show only the frame (generic Quad/Hexa/Octo). Motors, propellers, ESC, battery, and the full assembly button are unavailable there.
2. **Limited 3D model coverage.** Only `m2216` and `m2814` motors, only `p9045` propellers, only `v25` ESC, and only `b4-4000` battery have 3D assets. Other catalog entries participate in calculations but have no 3D representation.
3. **Approximate calculations.** Hover power uses an empirical `(mass/thrust)^1.5` relation; there is no propeller efficiency, air density, altitude, temperature, airflow, or ESC loss model. Results are not flight-performance data.
4. **Uncertified datasets.** Mass, current, thrust, and energy values are synthetic/prototype values.
5. **Incomplete validation.** It does not check:
   - electronics operating voltage against BEC/onboard power;
   - ESC peak current (only continuous);
   - motor/propeller compatibility;
   - battery C-rate separately from max current;
   - thermal limits, control-authority reserve, single-motor failure, etc.
6. **No persistence.** Reloading the page resets the configuration.
7. **No i18n.** The entire UI is in English.
8. **No separate `vite.config`.** Aliases, proxy, base path, etc. would require creating one.
9. **No linter/formatter.** ESLint/Prettier are not configured.
10. **Implicit test dependency.** `esbuild` comes through Vite; declaring it explicitly would make tests more robust.
11. **Duplicate assets.** `src/models/*.glb` duplicate `public/models/*.glb`; `public/models/aster_450_*.glb` duplicate the files under `frames/aster-450/`; three separate animation GLBs are unused. This increases repository size.
12. **Empty configuration is `Valid`.** Checks only run when relevant components exist. Acceptable for a prototype but potentially misleading.
13. **Ambiguous `averagePowerW`.** In `CurrentPowerCalculations` it means power at average current; in `BasicPerformanceSummary` it means estimated hover power.
14. **Tight coupling to Blender node names.** Renaming GLB nodes breaks mounting/animations. `assembly-assets.mjs` covers this.
15. **3D errors do not block the UI.** Missing GLBs lead to fallback/empty scenes and console warnings, but the app keeps working.
16. **Selection animations use the full GLB as a clip source.** Separate animation files under `public/models/animations/aster-450/` are not connected.
17. **Mission does not affect calculations or validation.** It only changes recommendations and the displayed label.
18. **Feature branches are milestone snapshots.** Only `main` is intended to be a complete buildable application.

---

## 19. Extension Guide

### Add a Catalog Component

1. Add an entry to the relevant `src/data/*.ts` with a unique ID.
2. Extend the interface in `src/configurator/types.ts` if needed.
3. Ensure `tests/data-sanity.mjs` passes (finite numbers, positive values, ordered limits).
4. For 3D, add an ID → path mapping in `src/three/*Models.ts`.
5. For motors/propellers/ESC/battery, ensure the GLB contains the required anchors and node names.
6. Update/add tests under `tests/`.

### Add a Frame

1. Add an entry to `src/data/frames.ts` (`allowedRotorCounts`, limits).
2. Update `src/three/frameModels.ts`:
   - base asset;
   - layout assets per rotor count;
   - required anchor list.
3. If needed, add full assembly support in `src/three/assemblyModels.ts` and animation clips.
4. Verify `resolveFrameModel` and `resolveRotorCount`.
5. Update `frame-selection.mjs`, `assembly-assets.mjs`, and UI tests.

### Add a Mission

1. Extend `MissionType`.
2. Add an option to `missionOptions` in `main.ts`.
3. Add a branch and rule function in `getMissionRecommendations`.
4. Add tests for thresholds, suppression, and ordering.
5. Verify that changing the mission does not alter components, calculations, or validation.

### Add an Electronics Type

1. Add an entry to `src/data/electronics.ts`.
2. Required components automatically enter the initial configuration and required list.
3. Optional components automatically get a checkbox; no `main.ts` changes needed.
4. `averagePowerW` automatically affects mass/current/power calculations.
5. To support Professional mission advice, add the ID to `PROFESSIONAL_EQUIPMENT_IDS`.

### Add a 3D Asset

1. Place the GLB under `public/models/<category>/<...>`.
2. Use a stable path starting with `/models/...`.
3. Follow node and anchor naming conventions.
4. Add a check to `tests/assembly-assets.mjs` (GLB parsing).
5. Remember that `src/models/` is not a Vite public directory; code uses `public/models/`.

---

## 20. File Reference

| File | Role |
|---|---|
| `index.html` | Vite HTML shell; mounts `#app` and `src/main.ts` |
| `src/main.ts` | All markup, UI state, handlers, Summary/recommendations, 3D wiring |
| `src/style.css` | Sole CSS file: theme, grid, panels, custom controls, responsiveness |
| `src/vite-env.d.ts` | Vite type reference |
| `src/configurator/types.ts` | Domain interfaces and units |
| `src/configurator/configuration.ts` | Initial state |
| `src/configurator/calculator.ts` | All calculations and `calculateBasicSummary` |
| `src/configurator/validator.ts` | Validation rules and message codes |
| `src/configurator/recommendations.ts` | Mission recommendations and priorities |
| `src/configurator/frameSelection.ts` | Allowed rotor-count resolution |
| `src/data/frames.ts` | Frame catalog |
| `src/data/motors.ts` | Motor catalog |
| `src/data/propellers.ts` | Propeller catalog |
| `src/data/escs.ts` | ESC catalog |
| `src/data/batteries.ts` | Battery catalog |
| `src/data/electronics.ts` | Electronics catalog |
| `src/three/scene.ts` | Scene, camera, loading/cache, mounting, animation, API |
| `src/three/controls.ts` | OrbitControls setup |
| `src/three/modelLoader.ts` | GLTFLoader wrapper |
| `src/three/droneModel.ts` | Procedural fallback model |
| `src/three/frameModels.ts` | Frames → GLB + anchors |
| `src/three/motorModels.ts` | Motors → GLB |
| `src/three/propellerModels.ts` | Propellers → CW/CCW + cap + handedness |
| `src/three/escModels.ts` | ESC → GLB |
| `src/three/batteryModels.ts` | Batteries → GLB |
| `src/three/assemblyModels.ts` | Full assembly → GLB |
| `src/three/selectionAnimations.ts` | Clip analysis, compression, playback |
| `src/ui/customSelect.ts` | Accessible custom select |
| `tests/*.mjs` | Logic, datasets, models, assets, animations |
| `tests/ui/smoke.mjs` | Browser test runner |
| `tests/ui/*.browser.js` | In-browser test scenarios |
| `tests/ui/*.html` | Browser test and manual QA pages |

---

## 21. Glossary

| Term | Meaning |
|---|---|
| **Aster 450 / 680 / 960** | Frame names; only 450 has a complete modular 3D set |
| **Anchor** | Named empty/service node in a GLB to which components attach |
| **MTOW** | Maximum Takeoff Weight |
| **T/W** | Thrust-to-weight ratio |
| **ESC** | Electronic Speed Controller |
| **4-in-1 ESC** | One physical module with four motor channels |
| **CW / CCW** | Clockwise / counter-clockwise propeller rotation |
| **Fallback** | Procedural model used when GLB loading fails |
| **Selection animation** | Animation that installs the selected component |
| **Assembly playback** | Full animated Aster 450 assembly |
| **Usable energy** | Battery energy after the 20% reserve |
| **Clip** | Three.js animation clip |
| **Warp** | Time remapping function used to compress idle intervals |

---

## 22. Summary

The project is a complete multirotor configurator prototype with clear separation of concerns:

- **data** — static catalogs with validated structure;
- **domain logic** — pure calculation, validation, and recommendation functions;
- **UI** — manual DOM control without a framework, plus accessible custom selects;
- **3D** — modular GLB resolution, caching, race protection, fallback, and an animation pipeline;
- **tests** — 94 fast unit/integration tests plus 7 browser scenarios covering real GLBs and animations.

Main future directions: add 3D models for the remaining components, expand validation (peak current, electronics, motor/propeller compatibility), move datasets to JSON/API, add configuration persistence and i18n, and keep the README, documentation, and repository hygiene in sync with the implementation.
