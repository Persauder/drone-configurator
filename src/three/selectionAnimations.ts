import * as THREE from 'three';

const ARM_NAMES = [1, 2, 3, 4].map((index) => `SmallQuad_Arm${String(index).padStart(2, '0')}_Assembly`);
const MOTOR_NAMES = [1, 2, 3, 4].map((index) => `SmallQuad_Motor_${String(index).padStart(2, '0')}`);
const ESC_NAMES = ['SmallQuad_ESC_4in1'];
const BATTERY_NAMES = ['SmallQuad_Battery'];
const PROPELLER_NAMES = [1, 2, 3, 4].map((index) => `SmallQuad_Propeller_${String(index).padStart(2, '0')}`);
const PROP_NUT_NAMES = [1, 2, 3, 4].map((index) => `SmallQuad_PropNut_${String(index).padStart(2, '0')}`);
const PROP_NUT_MESH_NAMES = [1, 2, 3, 4].map((index) => `SmallQuad_PropNut_${String(index).padStart(2, '0')}_Mesh`);
const BOLT_NAMES = [1, 2, 3, 4].flatMap((arm) =>
  (['Top', 'Bottom'] as const).flatMap((side) =>
    [1, 2, 3, 4].map((bolt) =>
      `SmallQuad_Arm${String(arm).padStart(2, '0')}_Bolt_${side}_${String(bolt).padStart(2, '0')}`)));

export const FRAME_CLIP_NAMES = [...ARM_NAMES, ...BOLT_NAMES] as const;
export const MOTOR_CLIP_NAMES = MOTOR_NAMES as readonly string[];
export const ESC_CLIP_NAMES = ESC_NAMES as readonly string[];
export const BATTERY_CLIP_NAMES = BATTERY_NAMES as readonly string[];
export const PROPELLER_CLIP_NAMES = [
  ...PROPELLER_NAMES, ...PROP_NUT_NAMES, ...PROP_NUT_MESH_NAMES,
] as const;

export interface MotionWindow {
  firstChange: number;
  lastChange: number;
  duration: number;
  removedIdle: number;
}

export interface SelectionPlayback {
  readonly duration: number;
  readonly time: number;
  update(deltaSeconds: number): boolean;
  finish(): void;
  cancel(): void;
  seek(seconds: number): void;
}

function changed(track: THREE.KeyframeTrack, index: number): boolean {
  const width = track.getValueSize();
  for (let component = 0; component < width; component++) {
    if (Math.abs(track.values[index * width + component]
      - track.values[(index - 1) * width + component]) > 1e-6) return true;
  }
  return false;
}

function requiredClips(source: readonly THREE.AnimationClip[], names: readonly string[]): THREE.AnimationClip[] {
  const byName = new Map(source.map((clip) => [clip.name, clip]));
  return names.map((name) => {
    const clip = byName.get(name);
    if (!clip || clip.tracks.length === 0) throw new Error(`Assembly motion clip "${name}" is missing.`);
    return clip;
  });
}

interface Gap { start: number; end: number; replacement: number }

function timing(clips: readonly THREE.AnimationClip[]): {
  window: MotionWindow; warp: (time: number) => number;
} {
  const moving: Array<[number, number]> = [];
  for (const clip of clips) {
    for (const track of clip.tracks) {
      for (let index = 1; index < track.times.length; index++) {
        if (changed(track, index)) moving.push([track.times[index - 1], track.times[index]]);
      }
    }
  }
  if (moving.length === 0) throw new Error('Assembly motion clips contain no changing transforms.');
  moving.sort((a, b) => a[0] - b[0]);
  const intervals: Array<[number, number]> = [];
  for (const [start, end] of moving) {
    const previous = intervals.at(-1);
    if (previous && start <= previous[1] + 1e-5) previous[1] = Math.max(previous[1], end);
    else intervals.push([start, end]);
  }
  const firstChange = intervals[0][0];
  const lastChange = intervals.at(-1)![1];
  const gaps: Gap[] = [];
  if (firstChange > 0.1) gaps.push({ start: 0, end: firstChange, replacement: 0.1 });
  for (let index = 1; index < intervals.length; index++) {
    const start = intervals[index - 1][1];
    const end = intervals[index][0];
    // Preserve the short mechanical pause before bolts. Compress the long
    // camera-only gaps between arms; no website camera animation is used.
    if (end - start > 0.75) gaps.push({ start, end, replacement: 0.25 });
  }
  const warp = (time: number): number => {
    let removed = 0;
    for (const gap of gaps) {
      const reduction = gap.end - gap.start - gap.replacement;
      if (time >= gap.end) removed += reduction;
      else if (time > gap.start) {
        return gap.start - removed + (time - gap.start) * gap.replacement / (gap.end - gap.start);
      } else break;
    }
    return time - removed;
  };
  const duration = warp(lastChange);
  return { window: { firstChange, lastChange, duration,
    removedIdle: lastChange - duration }, warp };
}

export function analyzeMotion(source: readonly THREE.AnimationClip[], names: readonly string[]): MotionWindow {
  return timing(requiredClips(source, names)).window;
}

function compactClips(source: readonly THREE.AnimationClip[], names: readonly string[]): {
  clips: THREE.AnimationClip[]; window: MotionWindow;
} {
  const originals = requiredClips(source, names);
  const { window, warp } = timing(originals);
  const clips = originals.map((original) => {
    const tracks = original.tracks.map((track) => {
      const width = track.getValueSize();
      const times = [0];
      const values = Array.from(track.values.slice(0, width));
      let previous = -1;
      for (let index = 1; index < track.times.length; index++) {
        const time = track.times[index];
        if (time < window.firstChange - 1e-5 || time > window.lastChange + 1e-5) continue;
        const next = warp(time);
        if (next <= previous + 1e-7) continue;
        times.push(next);
        values.push(...Array.from(track.values.slice(index * width, (index + 1) * width)));
        previous = next;
      }
      const copy = track.clone();
      copy.times = Float32Array.from(times);
      copy.values = Float32Array.from(values);
      return copy;
    });
    return new THREE.AnimationClip(original.name, window.duration, tracks);
  });
  return { clips, window };
}

function lastPosition(clip: THREE.AnimationClip): THREE.Vector3 {
  const track = clip.tracks.find((candidate) => candidate.name.endsWith('.position'));
  if (!track || track.getValueSize() !== 3) throw new Error(`Clip "${clip.name}" has no position track.`);
  return new THREE.Vector3().fromArray(track.values, track.values.length - 3);
}

function createPlayback(root: THREE.Object3D, clips: THREE.AnimationClip[]): SelectionPlayback {
  const mixer = new THREE.AnimationMixer(root);
  const duration = Math.max(...clips.map((clip) => clip.duration));
  const actions = clips.map((clip) => mixer.clipAction(clip));
  for (const action of actions) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
  }
  mixer.setTime(0);
  let time = 0;
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    stopped = true;
  };
  return {
    duration,
    get time() { return time; },
    update(deltaSeconds) {
      if (stopped) return true;
      time = Math.min(duration, time + Math.max(0, deltaSeconds));
      mixer.setTime(time);
      if (time >= duration) { stop(); return true; }
      return false;
    },
    seek(seconds) {
      if (stopped) return;
      time = THREE.MathUtils.clamp(seconds, 0, duration);
      mixer.setTime(time);
      if (time >= duration) stop();
    },
    finish() { if (!stopped) { mixer.setTime(duration); time = duration; stop(); } },
    cancel: stop,
  };
}

export function prepareFrameAssembly(frame: THREE.Group, source: readonly THREE.AnimationClip[]): {
  playback: SelectionPlayback; window: MotionWindow;
} {
  const originals = requiredClips(source, FRAME_CLIP_NAMES);
  frame.updateMatrixWorld(true);
  for (let index = 1; index <= 4; index++) {
    const suffix = String(index).padStart(2, '0');
    const groupName = `SmallQuad_Arm${suffix}_Assembly`;
    if (frame.getObjectByName(groupName)) throw new Error(`Static frame unexpectedly contains ${groupName}.`);
    const group = new THREE.Group();
    group.name = groupName;
    group.position.copy(lastPosition(originals.find((clip) => clip.name === groupName)!));
    frame.add(group);
    group.updateMatrixWorld(true);
    for (const name of [`SmallQuad_Arm_${suffix}`, `SmallQuad_MotorHousing_${suffix}`,
      `SmallQuad_HousingCollar_${suffix}`]) {
      const part = frame.getObjectByName(name);
      if (!part) throw new Error(`Static Aster frame is missing ${name}.`);
      group.attach(part);
    }
  }
  for (const name of BOLT_NAMES) {
    if (!frame.getObjectByName(name)) throw new Error(`Static Aster frame is missing ${name}.`);
  }
  const { clips, window } = compactClips(source, FRAME_CLIP_NAMES);
  return { playback: createPlayback(frame, clips), window };
}

export function prepareMotorInstallation(frame: THREE.Group, source: readonly THREE.AnimationClip[]): {
  playback: SelectionPlayback; window: MotionWindow;
} {
  for (const name of MOTOR_NAMES) {
    const root = frame.getObjectByName(name);
    if (!root) throw new Error(`Runtime motor root ${name} is missing.`);
  }
  const { clips, window } = compactClips(source, MOTOR_CLIP_NAMES);
  return { playback: createPlayback(frame, clips), window };
}

export function prepareEscInstallation(frame: THREE.Group, source: readonly THREE.AnimationClip[]): {
  playback: SelectionPlayback; window: MotionWindow;
} {
  for (const name of ESC_NAMES) {
    if (!frame.getObjectByName(name)) throw new Error(`Runtime ESC root ${name} is missing.`);
  }
  const { clips, window } = compactClips(source, ESC_CLIP_NAMES);
  return { playback: createPlayback(frame, clips), window };
}

export function prepareBatteryInstallation(frame: THREE.Group, source: readonly THREE.AnimationClip[]): {
  playback: SelectionPlayback; window: MotionWindow;
} {
  if (!frame.getObjectByName('SmallQuad_Battery')) {
    throw new Error('Runtime battery root SmallQuad_Battery is missing.');
  }
  const { clips, window } = compactClips(source, BATTERY_CLIP_NAMES);
  return { playback: createPlayback(frame, clips), window };
}

export function preparePropellerInstallation(frame: THREE.Group, source: readonly THREE.AnimationClip[]): {
  playback: SelectionPlayback; window: MotionWindow;
} {
  for (const name of PROPELLER_CLIP_NAMES) {
    if (!frame.getObjectByName(name)) throw new Error(`Runtime propeller target ${name} is missing.`);
  }
  const { clips, window } = compactClips(source, PROPELLER_CLIP_NAMES);
  return { playback: createPlayback(frame, clips), window };
}
