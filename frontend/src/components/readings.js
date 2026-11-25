import {
  Activity, ArrowDownToLine, ArrowUpFromLine, CircuitBoard, Clock, Cpu, Fan, Files, Flame, Gauge, HardDrive, HardDriveDownload, HardDriveUpload, HeartPulse, Layers, ListTree, MemoryStick, Monitor, Network, PenLine, Percent, PlugZap, RefreshCcw, ShieldAlert, ShieldX, Snowflake, Thermometer, ThermometerSun, Waypoints, Wifi, Zap,
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
// Rates arrive in bytes per second; Task Manager shows network in Mbps and disks in MB/s.
const mbps = (bytes) => (bytes === null || bytes === undefined ? bytes : (bytes * 8) / 1e6);
const mbPerS = (bytes) => (bytes === null || bytes === undefined ? bytes : bytes / 1e6);
/** "3:12:08", or "2 d 3:12:08", like Task Manager's Up time. */
export function upTime(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  return `${d ? `${d} d ` : ""}${h}:${m}:${sec}`;
}
const usedPercent = (d) => (d?.total_capacity_gb ? ((d.total_capacity_gb - (d.available_capacity_gb ?? 0)) / d.total_capacity_gb) * 100 : null);

export const GROUPS = [
  {
    id: "cpu", label: "Processor", icon: Cpu,
    readings: [
      { id: "cpu_core_temp", icon: Thermometer, label: "Temperature", unit: "°C", max: 100, warnAt: 80, warnText: "Hot", get: (s) => s.cpu?.core_temperature_c, hint: "Temperature of the hottest part of the processor." },
      { id: "cpu_package_temp", icon: ThermometerSun, label: "Whole-chip temperature", unit: "°C", max: 100, warnAt: 95, warnText: "Hot", get: (s) => s.cpu?.package_temperature_c, hint: "Temperature across the whole processor." },
      { id: "cpu_util", icon: Activity, label: "How busy", unit: "%", max: 100, warnAt: 90, warnText: "High load", get: (s) => s.cpu?.utilization_percent, hint: "How busy the processor is." },
      { id: "cpu_clock", icon: Gauge, label: "Speed", unit: " GHz", digits: 1, max: 6, get: (s) => s.cpu?.clock_speed_ghz, hint: "The speed the processor is running at." },
      { id: "cpu_power", icon: Zap, label: "Power use", unit: " W", max: 150, get: (s) => s.cpu?.package_power_w, hint: "Power the processor is drawing." },
      { id: "cpu_fan", icon: Fan, label: "Fan speed", unit: " RPM", max: 2500, get: (s) => s.cpu?.fan_speed_rpm, hint: "How fast the processor fan spins (turns per minute)." },
      { id: "cpu_throttle", icon: Snowflake, label: "Slowing down to cool", kind: "flag", warnText: "Slowing down", okText: "Running at full speed", get: (s) => s.cpu?.thermal_throttling, hint: "Whether the processor is slowing itself down because it is too hot." },
    ],
    layout: { stats: ["cpu_core_temp", "cpu_package_temp", "cpu_clock"], gauge: "cpu_util", big: "cpu_power", pills: ["cpu_fan", "cpu_throttle"] },
  },
  {
    id: "gpu", label: "Graphics", icon: Monitor,
    readings: [
      { id: "gpu_core_temp", icon: Thermometer, label: "Temperature", unit: "°C", max: 100, warnAt: 85, warnText: "Hot", get: (s) => s.gpu?.core_temperature_c, hint: "Temperature of the graphics chip." },
      { id: "gpu_hotspot", icon: Flame, label: "Hottest spot", unit: "°C", max: 110, warnAt: 95, warnText: "Hot", get: (s) => s.gpu?.hotspot_temperature_c, hint: "Hottest point on the graphics card." },
      { id: "gpu_util", icon: Activity, label: "How busy", unit: "%", max: 100, warnAt: 90, warnText: "High load", get: (s) => s.gpu?.utilization_percent, hint: "How busy the graphics card is." },
      { id: "gpu_fan", icon: Fan, label: "Fan speed", unit: "%", max: 100, get: (s) => s.gpu?.fan_speed_percent, hint: "Graphics card fan, as a share of full speed." },
      { id: "gpu_vram", icon: MemoryStick, label: "Graphics memory used", unit: " GB", digits: 1, max: 8, maxOf: (s) => s.gpu?.vram_total_gb, get: (s) => s.gpu?.vram_used_gb, of: (s) => s.gpu?.vram_total_gb, hint: "Graphics memory in use." },
      { id: "gpu_power", icon: Zap, label: "Power use", unit: " W", max: 350, get: (s) => s.gpu?.board_power_w, hint: "Power the graphics card is drawing." },
      { id: "gpu_shared", icon: MemoryStick, label: "Borrowed memory", unit: " GB", digits: 1, max: 16, get: (s) => s.gpu?.shared_memory_used_gb, hint: "Ordinary memory the graphics chip is borrowing." },
      { id: "gpu_name", icon: Monitor, label: "Graphics card", kind: "text", get: (s) => s.gpu?.gpu_name, hint: "The graphics card Lectio detected." },
    ],
    layout: { stats: ["gpu_core_temp", "gpu_hotspot", "gpu_power"], gauge: "gpu_util", big: "gpu_vram", pills: ["gpu_fan", "gpu_name"] },
  },
  {
    id: "ram", label: "Memory", icon: MemoryStick,
    readings: [
      { id: "ram_usage", icon: Percent, label: "Memory in use", unit: "%", max: 100, warnAt: 85, warnText: "High usage", get: (s) => s.ram?.usage_percent, hint: "Share of installed memory in use." },
      { id: "ram_used", icon: MemoryStick, label: "Memory used", unit: " GB", digits: 1, max: 32, maxOf: (s) => s.ram?.total_gb, get: (s) => s.ram?.used_gb, of: (s) => s.ram?.total_gb, hint: "Memory in use, out of what is installed." },
      { id: "ram_pagefile", icon: Files, label: "Overflow memory on disk", unit: "%", max: 100, get: (s) => s.ram?.pagefile_usage_percent, hint: "How full the space Windows sets aside on the drive for when memory runs out (the pagefile)." },
      { id: "ram_committed", icon: Layers, label: "Memory promised", unit: " GB", digits: 1, max: 32, maxOf: (s) => s.ram?.commit_limit_gb, get: (s) => s.ram?.committed_gb, of: (s) => s.ram?.commit_limit_gb, hint: "Memory programs have asked Windows to keep for them, out of what Windows can give." },
      { id: "ram_whea", icon: ShieldAlert, label: "Hardware errors", max: 5, warnAt: 1, warnText: "Errors logged", okText: "None logged", get: (s) => s.ram?.whea_error_count, hint: "Hardware problems Windows has recorded (WHEA errors)." },
    ],
    layout: { stats: [], gauge: "ram_usage", big: "ram_used", pills: ["ram_pagefile", "ram_whea"] },
  },
  {
    id: "storage", label: "Storage", icon: HardDrive,
    readings: [
      { id: "disk_used", icon: HardDrive, label: "Space used", unit: "%", max: 100, warnAt: 90, warnText: "Almost full", okText: "Healthy", get: (s) => usedPercent(drive(s)), hint: "Share of the drive that is full." },
      { id: "disk_smart", icon: HeartPulse, label: "Drive health", unit: "%", max: 100, warnBelow: 20, warnText: "Failing", okText: "Healthy", get: (s) => drive(s)?.smart_health_percent, hint: "The drive's own estimate of how much life it has left (S.M.A.R.T.)." },
      { id: "disk_tbw", icon: PenLine, label: "Lifetime data written", unit: " TB", digits: 1, max: 600, get: (s) => drive(s)?.total_bytes_written_tbw, hint: "Terabytes written over the drive's life." },
      { id: "disk_temp", icon: Thermometer, label: "Drive temperature", unit: "°C", max: 80, get: (s) => drive(s)?.temperature_c, hint: "Temperature of the drive." },
      { id: "disk_realloc", icon: RefreshCcw, label: "Worn areas replaced", max: 10, warnAt: 1, warnText: "Check drive", okText: "Healthy", get: (s) => drive(s)?.reallocated_sector_count, hint: "Worn-out areas the drive has replaced." },
      { id: "disk_active", icon: Activity, label: "How busy", unit: "%", max: 100, get: (s) => s.disk?.active_percent, hint: "Share of time the disks were busy, as Task Manager shows it." },
      { id: "disk_read", icon: HardDriveDownload, label: "Read speed", unit: " MB/s", digits: 1, max: 500, get: (s) => mbPerS(s.disk?.read_bytes_per_s), hint: "Data read from the disks each second." },
      { id: "disk_write", icon: HardDriveUpload, label: "Write speed", unit: " MB/s", digits: 1, max: 500, get: (s) => mbPerS(s.disk?.write_bytes_per_s), hint: "Data written to the disks each second." },
      { id: "disk_bad", icon: ShieldX, label: "Damaged areas", max: 10, warnAt: 1, warnText: "Check drive", okText: "Healthy", get: (s) => drive(s)?.bad_sector_count, hint: "Areas of the drive that can't be read." },
    ],
    layout: { stats: ["disk_temp", "disk_tbw", "disk_smart"], gauge: "disk_used", big: null, pills: ["disk_realloc", "disk_bad"] },
  },
  {
    id: "board", label: "Power", icon: Zap,
    readings: [
      { id: "vrm_temp", icon: Thermometer, label: "Power parts temperature", unit: "°C", max: 120, warnAt: 85, warnText: "Hot", get: (s) => s.power_vrm?.vrm_temperature_c, hint: "Temperature of the parts that feed power to the processor (the VRM)." },
      { id: "psu_12v", icon: PlugZap, label: "Power supply", unit: " V", digits: 2, min: 11, max: 13, warnBelow: 11.4, warnAt: 12.6, warnText: "Out of range", okText: "In range", get: (s) => s.power_vrm?.psu_12v_voltage, hint: "The power supply's main voltage; it should stay near 12 V." },
      { id: "chipset_temp", icon: CircuitBoard, label: "Motherboard temperature", unit: "°C", max: 100, get: (s) => s.power_vrm?.chipset_temperature_c, hint: "Motherboard chipset temperature." },
      { id: "chassis_fan", icon: Fan, label: "Case fan", unit: " RPM", max: 2000, get: (s) => s.power_vrm?.chassis_fan_speed_rpm, hint: "How fast the case fan spins (turns per minute)." },
    ],
    layout: { stats: [], gauge: "vrm_temp", big: "psu_12v", pills: ["chipset_temp", "chassis_fan"] },
  },
  {
    id: "network", label: "Network", icon: Wifi,
    readings: [
      { id: "net_down", icon: ArrowDownToLine, label: "Download", unit: " Mbps", digits: 1, max: 100, maxOf: (s) => s.network?.link_speed_mbps, get: (s) => mbps(s.network?.receive_bytes_per_s), hint: "Data arriving each second on the busiest adapter." },
      { id: "net_up", icon: ArrowUpFromLine, label: "Upload", unit: " Mbps", digits: 1, max: 100, maxOf: (s) => s.network?.link_speed_mbps, get: (s) => mbps(s.network?.send_bytes_per_s), hint: "Data leaving each second on the busiest adapter." },
      { id: "net_link", icon: Waypoints, label: "Connection speed", unit: " Mbps", max: 1000, get: (s) => s.network?.link_speed_mbps, hint: "The fastest speed the adapter's connection allows." },
      {
        id: "net_use", icon: Gauge, label: "Network use", unit: "%", digits: 1, max: 100,
        get: (s) => {
          const n = s.network;
          if (!n?.link_speed_mbps || n.receive_bytes_per_s == null) return null;
          return Math.min(100, ((mbps(n.receive_bytes_per_s) + (mbps(n.send_bytes_per_s) || 0)) / n.link_speed_mbps) * 100);
        },
        hint: "Download plus upload, as a share of the link speed.",
      },
      {
        id: "net_total", icon: Activity, label: "Total traffic", unit: " Mbps", digits: 1, max: 100, maxOf: (s) => s.network?.link_speed_mbps,
        get: (s) => (s.network?.receive_bytes_per_s == null ? null : mbps(s.network.receive_bytes_per_s) + (mbps(s.network.send_bytes_per_s) || 0)),
        hint: "Download and upload together.",
      },
      { id: "net_adapter", icon: Network, label: "Network adapter", kind: "text", get: (s) => s.network?.adapter_name, hint: "The network adapter carrying the most data." },
    ],
    layout: { stats: ["net_down", "net_up", "net_link"], gauge: "net_use", big: "net_total", pills: ["net_adapter", "net_link"] },
  },
  {
    id: "processes", label: "Programs", icon: ListTree,
    readings: [
      { id: "proc_count", icon: ListTree, label: "Programs and services", max: 1000, get: (s) => s.cpu?.process_count, hint: "Programs and background services running now." },
      { id: "proc_threads", icon: Waypoints, label: "Tasks", max: 10000, get: (s) => s.cpu?.thread_count, hint: "Separate tasks the running programs are doing." },
      { id: "proc_handles", icon: Files, label: "Open files and settings", max: 300000, get: (s) => s.cpu?.handle_count, hint: "Files, keys and other resources programs have open." },
      { id: "proc_uptime", icon: Clock, label: "Time since restart", kind: "text", okText: "Since Windows last started", get: (s) => upTime(s.cpu?.uptime_seconds), hint: "How long Windows has been running since it last started." },
      { id: "proc_cpu", icon: Activity, label: "Total CPU", unit: "%", max: 100, warnAt: 90, warnText: "High load", get: (s) => s.cpu?.utilization_percent, hint: "All programs together." },
      { id: "proc_mem", icon: Percent, label: "Total memory", unit: "%", max: 100, warnAt: 85, warnText: "High usage", get: (s) => s.ram?.usage_percent, hint: "Share of installed memory in use." },
    ],
    // The gauge and big card slots hold the top programs list (see Dashboard).
    layout: { stats: ["proc_count", "proc_uptime", "proc_threads"], gauge: null, big: null, list: "processes", pills: ["proc_cpu", "proc_mem"] },
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
  // The PC didn't report it: most often its hardware or Windows can't provide it.
  if (value === null || value === undefined) return { warn: false, text: "Not available on this PC" };
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
