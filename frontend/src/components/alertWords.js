// Alerts in plain words for the bell's window: "Office PC is running hot",
// "Processor at 91°C", instead of the rule's technical message.

const n = (v, digits = 0) => Number(v).toLocaleString("en-US", { maximumFractionDigits: digits });
const own = (pc) => (pc.endsWith("s") ? `${pc}'` : `${pc}'s`);

const KINDS = [
  { rules: ["CPU_OVERHEATING_CRITICAL", "CPU_OVERHEATING_WARNING", "CPU_PACKAGE_OVERHEATING_CRITICAL"],
    title: (pc) => `${pc} is running hot`, detail: (a) => `Processor at ${n(a.trigger_value)}°C` },
  { rules: ["GPU_HOTSPOT_CRITICAL", "GPU_CORE_OVERHEATING_WARNING"],
    title: (pc) => `${own(pc)} graphics card is running hot`, detail: (a) => `Graphics card at ${n(a.trigger_value)}°C` },
  { rules: ["VRM_OVERHEATING_CRITICAL", "VRM_OVERHEATING_WARNING"],
    title: (pc) => `${own(pc)} motherboard is running hot`, detail: (a) => `Its power parts are at ${n(a.trigger_value)}°C` },
  { rules: ["PSU_12V_UNDERVOLTAGE_CRITICAL", "PSU_12V_OVERVOLTAGE_CRITICAL"],
    title: (pc) => `${own(pc)} power supply is unsteady`, detail: (a) => `${n(a.trigger_value, 2)} V, it should stay near 12 V` },
  { rules: ["NVME_HEALTH_LOW_WARNING", "NVME_HEALTH_CRITICAL"],
    title: (pc) => `${own(pc)} drive is wearing out`, detail: (a) => `Drive health ${n(a.trigger_value)}%` },
  { rules: ["WHEA_ERROR_SPIKE_WARNING"],
    title: (pc) => `${pc} has hardware errors`, detail: (a) => `Windows logged ${n(a.trigger_value)} hardware error${a.trigger_value === 1 ? "" : "s"}` },
  { rules: ["CPU_HIGH_UTILIZATION_INFO"],
    title: (pc) => `${pc} is working very hard`, detail: (a) => `Processor ${n(a.trigger_value)}% busy` },
  { rules: ["GPU_HIGH_UTILIZATION_INFO"],
    title: (pc) => `${own(pc)} graphics card is working very hard`, detail: (a) => `${n(a.trigger_value)}% busy` },
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
