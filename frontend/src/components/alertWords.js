// Alerts in plain words for the bell's window: "Office PC is running hot",
// "Processor at 91°C", instead of the rule's technical message.

const n = (v, digits = 0) => Number(v).toLocaleString("en-US", { maximumFractionDigits: digits });
const own = (pc) => (pc.endsWith("s") ? `${pc}'` : `${pc}'s`);

const KINDS = [
  { rules: ["CPU_OVERHEATING_CRITICAL", "CPU_OVERHEATING_WARNING", "CPU_PACKAGE_OVERHEATING_CRITICAL", "CPU_PACKAGE_OVERHEATING_WARNING"],
    title: (pc) => `${pc} is running hot`, detail: (a) => `Processor at ${n(a.trigger_value)}°C` },
  { rules: ["CPU_THERMAL_THROTTLING_WARNING"],
    title: (pc) => `${pc} is slowing down to cool off`, detail: () => "The processor is too hot to run at full speed" },
  { rules: ["GPU_HOTSPOT_CRITICAL", "GPU_HOTSPOT_WARNING", "GPU_CORE_OVERHEATING_CRITICAL", "GPU_CORE_OVERHEATING_WARNING"],
    title: (pc) => `${own(pc)} graphics card is running hot`, detail: (a) => `Graphics card at ${n(a.trigger_value)}°C` },
  { rules: ["GPU_FAN_STOPPED_CRITICAL", "GPU_FAN_STOPPED_WARNING"],
    title: (pc) => `${own(pc)} graphics card fan has stopped`, detail: () => "The card is hot but its fan isn't spinning" },
  { rules: ["GPU_VRAM_FULL_WARNING"],
    title: (pc) => `${own(pc)} graphics memory is full`, detail: (a) => `${n(a.trigger_value)}% of video memory in use` },
  { rules: ["VRM_OVERHEATING_CRITICAL", "VRM_OVERHEATING_WARNING"],
    title: (pc) => `${own(pc)} motherboard is running hot`, detail: (a) => `Its power parts are at ${n(a.trigger_value)}°C` },
  { rules: ["CHIPSET_OVERHEATING_CRITICAL", "CHIPSET_OVERHEATING_WARNING"],
    title: (pc) => `${own(pc)} motherboard is running hot`, detail: (a) => `Its chipset is at ${n(a.trigger_value)}°C` },
  { rules: ["CHASSIS_FAN_STOPPED_CRITICAL"],
    title: (pc) => `${own(pc)} case fan has stopped`, detail: (a) => `${n(a.trigger_value)} RPM while the PC is hot` },
  { rules: ["PSU_12V_UNDERVOLTAGE_CRITICAL", "PSU_12V_UNDERVOLTAGE_WARNING", "PSU_12V_OVERVOLTAGE_CRITICAL"],
    title: (pc) => `${own(pc)} power supply is unsteady`, detail: (a) => `${n(a.trigger_value, 2)} V, it should stay near 12 V` },
  { rules: ["RAM_USAGE_CRITICAL", "RAM_USAGE_WARNING"],
    title: (pc) => `${pc} is low on memory`, detail: (a) => `${n(a.trigger_value)}% of memory in use` },
  { rules: ["COMMIT_CHARGE_CRITICAL", "COMMIT_CHARGE_WARNING"],
    title: (pc) => `${pc} is running out of memory`, detail: (a) => `${n(a.trigger_value)}% of what Windows can hand out is taken` },
  { rules: ["PAGEFILE_USAGE_CRITICAL", "PAGEFILE_USAGE_WARNING"],
    title: (pc) => `${own(pc)} page file is filling up`, detail: (a) => `${n(a.trigger_value)}% in use` },
  { rules: ["NVME_HEALTH_LOW_WARNING", "NVME_HEALTH_CRITICAL"],
    title: (pc) => `${own(pc)} drive is wearing out`, detail: (a) => `${n(a.trigger_value)}% of its life left` },
  { rules: ["DRIVE_BAD_SECTORS_CRITICAL", "DRIVE_BAD_SECTORS_WARNING"],
    title: (pc) => `${own(pc)} drive has damaged areas`, detail: (a) => `${n(a.trigger_value)} bad sector${a.trigger_value === 1 ? "" : "s"}: back up your files` },
  { rules: ["DRIVE_OVERHEATING_CRITICAL", "DRIVE_OVERHEATING_WARNING"],
    title: (pc) => `${own(pc)} drive is running hot`, detail: (a) => `Drive at ${n(a.trigger_value)}°C` },
  { rules: ["DISK_FULL_CRITICAL", "DISK_FULL_WARNING"],
    title: (pc) => `${own(pc)} drive is filling up`, detail: (a) => `${n(a.trigger_value)}% used` },
  { rules: ["SYSTEM_DRIVE_SPACE_CRITICAL", "SYSTEM_DRIVE_SPACE_WARNING"],
    title: (pc) => `${pc} is low on disk space`, detail: (a) => `${n(a.trigger_value, 1)} GB free on drive C:` },
  { rules: ["DISK_BUSY_INFO"],
    title: (pc) => `${own(pc)} disk is very busy`, detail: (a) => `Busy ${n(a.trigger_value)}% of the time` },
  { rules: ["WHEA_ERROR_SPIKE_WARNING", "WHEA_ERRORS_CRITICAL"],
    title: (pc) => `${pc} has hardware errors`, detail: (a) => `Windows logged ${n(a.trigger_value)} hardware error${a.trigger_value === 1 ? "" : "s"}` },
  { rules: ["HANDLE_COUNT_CRITICAL", "HANDLE_COUNT_WARNING", "THREAD_COUNT_CRITICAL", "THREAD_COUNT_WARNING",
            "PROCESS_COUNT_CRITICAL", "PROCESS_COUNT_WARNING"],
    title: (pc) => `A program on ${pc} may be misbehaving`, detail: (a) => a.message },
  { rules: ["UPTIME_LONG_WARNING", "UPTIME_LONG_INFO"],
    title: (pc) => `${pc} needs a restart`, detail: (a) => `Not restarted for ${n(a.trigger_value)} days` },
  { rules: ["CPU_HIGH_UTILIZATION_INFO"],
    title: (pc) => `${pc} is working very hard`, detail: (a) => `Processor ${n(a.trigger_value)}% busy` },
  { rules: ["GPU_HIGH_UTILIZATION_INFO"],
    title: (pc) => `${own(pc)} graphics card is working very hard`, detail: (a) => `${n(a.trigger_value)}% busy` },
  { rules: ["NETWORK_SATURATED_INFO"],
    title: (pc) => `${own(pc)} internet connection is full`, detail: (a) => `${n(a.trigger_value)}% of the link in use` },
];

const BY_RULE = Object.fromEntries(KINDS.flatMap((k) => k.rules.map((r) => [r, k])));

/** { title, detail } for an alert on the PC named `pc`. */
export function alertWords(alert, pc = "Your PC") {
  const kind = BY_RULE[alert.rule_name];
  if (!kind) return { title: `${pc} needs a look`, detail: alert.message };
  return { title: kind.title(pc), detail: kind.detail(alert) };
}

const RANK = { CRITICAL: 0, WARNING: 1, INFO: 2 };

/** Most serious first, then newest first. */
export function sortAlerts(alerts) {
  return [...alerts].sort((a, b) =>
    (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3) || new Date(b.created_at) - new Date(a.created_at));
}
