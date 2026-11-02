const batteryModels: Readonly<Record<string, string>> = {
  'battery-b4-4000': '/models/batteries/small/small_battery.glb',
};

export function resolveBatteryModel(batteryId?: string): string | undefined {
  return batteryId ? batteryModels[batteryId] : undefined;
}
