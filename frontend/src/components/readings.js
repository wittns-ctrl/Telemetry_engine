import {
  Activity, CircuitBoard, Cpu, Fan, Files, Flame, Gauge, HardDrive, HeartPulse, MemoryStick, Monitor, PenLine, Percent, PlugZap, RefreshCcw, ShieldAlert, ShieldX, Snowflake, Thermometer, ThermometerSun, Zap,
} from "lucide-react";

// Every value in the backend's telemetry snapshot (app/models/telemetry.py),
// grouped by component. Each reading says how to pull its value out of a
// snapshot, how to show it, and when it counts as a warning. The warning
// levels for temperatures, load, voltage, drive health and WHEA errors are the
// alert rules in app/core/anomaly_rules.py.
//
// icon: what the card shows for this reading.
// kind: "number" (default), "flag" (on / off) or "text".
// max: top of the graph, gauge and ring. warnAt / warnBelow: warning levels.

const drive = (s) => s?.storage?.[0];
const usedPercent = (d) => (d?.total_capacity_gb ? ((d.total_capacity_gb - (d.available_capacity_gb ?? 0)) / d.total_capacity_gb) * 100 : null);

export const GROUPS = [
  {
    id: "cpu", label: "CPU", icon: Cpu,
    readings: [
      { id: "cpu_core_temp", icon: Thermometer, label: "Core temperature", unit: "°C", max: 100, warnAt: 80, warnText: "Hot", get: (s) => s.cpu?.core_temperature_c, hint: "Temperature of the hottest processor core." },
      { id: "cpu_package_temp", icon: ThermometerSun, label: "Package temperature", unit: "°C", max: 100, warnAt: 95, warnText: "Hot", get: (s) => s.cpu?.package_temperature_c, hint: "Temperature across the whole processor." },
      { id: "cpu_util", icon: Activity, label: "Utilization", unit: "%", max: 100, warnAt: 90, warnText: "High load", get: (s) => s.cpu?.utilization_percent, hint: "How busy the processor is." },
      { id: "cpu_clock", icon: Gauge, label: "Clock speed", unit: " GHz", digits: 1, max: 6, get: (s) => s.cpu?.clock_speed_ghz, hint: "The speed the processor is running at." },
      { id: "cpu_power", icon: Zap, label: "Package power", unit: " W", max: 150, get: (s) => s.cpu?.package_power_w, hint: "Power the processor is drawing." },
      { id: "cpu_fan", icon: Fan, label: "Fan speed", unit: " RPM", max: 2500, get: (s) => s.cpu?.fan_speed_rpm, hint: "Revolutions per minute of the CPU fan." },
      { id: "cpu_throttle", icon: Snowflake, label: "Thermal throttling", kind: "flag", warnText: "Throttling", okText: "Not throttling", get: (s) => s.cpu?.thermal_throttling, hint: "Whether the CPU is slowing down to cool off." },
    ],
    layout: { stats: ["cpu_core_temp", "cpu_package_temp", "cpu_clock"], gauge: "cpu_util", big: "cpu_power", pills: ["cpu_fan", "cpu_throttle"] },
  },
  {
    id: "gpu", label: "GPU", icon: Monitor,
    readings: [
      { id: "gpu_core_temp", icon: Thermometer, label: "Core temperature", unit: "°C", max: 100, warnAt: 85, warnText: "Hot", get: (s) => s.gpu?.core_temperature_c, hint: "Temperature of the graphics chip." },
      { id: "gpu_hotspot", icon: Flame, label: "Hotspot temperature", unit: "°C", max: 110, warnAt: 95, warnText: "Hot", get: (s) => s.gpu?.hotspot_temperature_c, hint: "Hottest point on the graphics card." },
      { id: "gpu_util", icon: Activity, label: "Utilization", unit: "%", max: 100, warnAt: 90, warnText: "High load", get: (s) => s.gpu?.utilization_percent, hint: "How busy the graphics card is." },
      { id: "gpu_fan", icon: Fan, label: "Fan speed", unit: "%", max: 100, get: (s) => s.gpu?.fan_speed_percent, hint: "Graphics card fan, as a share of full speed." },
      { id: "gpu_vram", icon: MemoryStick, label: "VRAM used", unit: " GB", digits: 1, max: 8, maxOf: (s) => s.gpu?.vram_total_gb, get: (s) => s.gpu?.vram_used_gb, of: (s) => s.gpu?.vram_total_gb, hint: "Graphics memory in use." },
      { id: "gpu_power", icon: Zap, label: "Board power", unit: " W", max: 350, get: (s) => s.gpu?.board_power_w, hint: "Power the graphics card is drawing." },
      { id: "gpu_name", icon: Monitor, label: "Graphics card", kind: "text", get: (s) => s.gpu?.gpu_name, hint: "The graphics card Lectio detected." },
    ],
    layout: { stats: ["gpu_core_temp", "gpu_hotspot", "gpu_power"], gauge: "gpu_util", big: "gpu_vram", pills: ["gpu_fan", "gpu_name"] },
  },
  {
    id: "ram", label: "Memory", icon: MemoryStick,
    readings: [
      { id: "ram_usage", icon: Percent, label: "RAM usage", unit: "%", max: 100, warnAt: 85, warnText: "High usage", get: (s) => s.ram?.usage_percent, hint: "Share of installed memory in use." },
      { id: "ram_used", icon: MemoryStick, label: "RAM used", unit: " GB", digits: 1, max: 32, maxOf: (s) => s.ram?.total_gb, get: (s) => s.ram?.used_gb, of: (s) => s.ram?.total_gb, hint: "Memory in use, out of what is installed." },
      { id: "ram_pagefile", icon: Files, label: "Pagefile usage", unit: "%", max: 100, get: (s) => s.ram?.pagefile_usage_percent, hint: "How full the Windows pagefile is." },
      { id: "ram_whea", icon: ShieldAlert, label: "WHEA errors", max: 5, warnAt: 1, warnText: "Errors logged", okText: "None logged", get: (s) => s.ram?.whea_error_count, hint: "Hardware errors Windows has recorded." },
    ],
    layout: { stats: [], gauge: "ram_usage", big: "ram_used", pills: ["ram_pagefile", "ram_whea"] },
  },
  {
    id: "storage", label: "Storage", icon: HardDrive,
    readings: [
      { id: "disk_used", icon: HardDrive, label: "Capacity used", unit: "%", max: 100, warnAt: 90, warnText: "Almost full", okText: "Healthy", get: (s) => usedPercent(drive(s)), hint: "Share of the drive that is full." },
      { id: "disk_smart", icon: HeartPulse, label: "S.M.A.R.T. health", unit: "%", max: 100, warnBelow: 20, warnText: "Failing", okText: "Healthy", get: (s) => drive(s)?.smart_health_percent, hint: "The drive's own health estimate." },
      { id: "disk_tbw", icon: PenLine, label: "Data written", unit: " TBW", digits: 1, max: 600, get: (s) => drive(s)?.total_bytes_written_tbw, hint: "Terabytes written over the drive's life." },
      { id: "disk_temp", icon: Thermometer, label: "Drive temperature", unit: "°C", max: 80, get: (s) => drive(s)?.temperature_c, hint: "Temperature of the drive." },
      { id: "disk_realloc", icon: RefreshCcw, label: "Reallocated sectors", max: 10, warnAt: 1, warnText: "Check drive", okText: "Healthy", get: (s) => drive(s)?.reallocated_sector_count, hint: "Worn-out areas the drive has replaced." },
      { id: "disk_bad", icon: ShieldX, label: "Bad sectors", max: 10, warnAt: 1, warnText: "Check drive", okText: "Healthy", get: (s) => drive(s)?.bad_sector_count, hint: "Areas of the drive that can't be read." },
    ],
    layout: { stats: ["disk_temp", "disk_tbw", "disk_smart"], gauge: "disk_used", big: null, pills: ["disk_realloc", "disk_bad"] },
  },
  {
    id: "board", label: "Power and board", icon: Zap,
    readings: [
      { id: "vrm_temp", icon: Thermometer, label: "VRM temperature", unit: "°C", max: 120, warnAt: 85, warnText: "Hot", get: (s) => s.power_vrm?.vrm_temperature_c, hint: "Motherboard power circuitry temperature." },
      { id: "psu_12v", icon: PlugZap, label: "PSU +12V rail", unit: " V", digits: 2, min: 11, max: 13, warnBelow: 11.4, warnAt: 12.6, warnText: "Out of range", okText: "In range", get: (s) => s.power_vrm?.psu_12v_voltage, hint: "Power supply voltage; it should stay near 12 V." },
      { id: "chipset_temp", icon: CircuitBoard, label: "Chipset temperature", unit: "°C", max: 100, get: (s) => s.power_vrm?.chipset_temperature_c, hint: "Motherboard chipset temperature." },
      { id: "chassis_fan", icon: Fan, label: "Chassis fan", unit: " RPM", max: 2000, get: (s) => s.power_vrm?.chassis_fan_speed_rpm, hint: "Revolutions per minute of the case fan." },
    ],
    layout: { stats: [], gauge: "vrm_temp", big: "psu_12v", pills: ["chipset_temp", "chassis_fan"] },
  },
];

export const READING_COUNT = GROUPS.reduce((n, g) => n + g.readings.length, 0);

/** The reading's value in a snapshot, or null when the PC didn't report it. */
export function valueOf(reading, snapshot) {
  if (!snapshot) return null;
  const value = reading.get(snapshot);
  return value === undefined ? null : value;
}

/** Top of the scale for a reading; some (VRAM, RAM) depend on the PC. */
export function maxOf(reading, snapshot) {
  return (snapshot && reading.maxOf?.(snapshot)) || reading.max || 100;
}

/** Whether a value has crossed its warning level, and the words for it. */
export function statusOf(reading, value) {
  if (value === null || value === undefined) return { warn: false, text: "No reading" };
  const warn = reading.kind === "flag"
    ? Boolean(value)
    : reading.kind === "text"
      ? false
      : (reading.warnAt !== undefined && value >= reading.warnAt) || (reading.warnBelow !== undefined && value <= reading.warnBelow);
  return { warn, text: warn ? reading.warnText : reading.okText || (reading.kind === "text" ? "Detected" : "Normal") };
}

/** The value as shown on a card, split into the number and its unit. */
export function display(reading, value) {
  if (value === null || value === undefined || value === "") return { text: "—", unit: "" };
  if (reading.kind === "flag") return { text: value ? "On" : "Off", unit: "" };
  if (reading.kind === "text") return { text: String(value), unit: "" };
  const text = Number(value).toLocaleString("en-US", { minimumFractionDigits: reading.digits || 0, maximumFractionDigits: reading.digits || 0 });
  return { text, unit: (reading.unit || "").trim() };
}

/** "45°C", "4.7 GHz", "1,250 RPM": the value and unit as one string. */
export function show(reading, value) {
  const d = display(reading, value);
  if (!d.unit) return d.text;
  return /^[%°]/.test(d.unit) ? `${d.text}${d.unit}` : `${d.text} ${d.unit}`;
}

export const isCharted = (reading) => !reading.kind || reading.kind === "number";

/**
 * A PC's health score: the share of its readings that are within their limits,
 * as a whole percentage. Null when the snapshot has no readings to judge.
 */
export function healthOf(snapshot) {
  if (!snapshot) return null;
  let judged = 0;
  let fine = 0;
  GROUPS.forEach((group) => group.readings.forEach((reading) => {
    if (reading.kind === "text") return;
    const value = valueOf(reading, snapshot);
    if (value === null) return;
    judged += 1;
    if (!statusOf(reading, value).warn) fine += 1;
  }));
  return judged ? Math.round((fine / judged) * 100) : null;
}
