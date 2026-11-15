// Placeholder figures for the dashboard. The layout follows the reference
// template; the content is Lectio's own (PC hardware health). Nothing here
// comes from the API yet: these get replaced when the backend is reconnected.

export const WELCOME = {
  subtitle: "Here's what's happening with your PC today.",
  device: { name: "My Windows PC", detail: "Windows 11 • Desktop", status: "Connected" },
  searchHint: "Search devices, metrics, sensors, alerts...",
};

// What the banner search understands: a query matching any word opens that page.
export const SEARCH_TARGETS = [
  { id: "devices", words: ["device", "devices", "pc", "computer", "system", "windows", "storage", "disk", "drive"] },
  { id: "sensors", words: ["sensor", "sensors", "temperature", "temp", "cpu", "gpu", "fan", "thermal", "heat"] },
  { id: "live", words: ["alert", "alerts", "live", "monitor", "stream", "notification", "notifications", "power"] },
  { id: "analytics", words: ["analytics", "trend", "trends", "history", "report", "ram", "memory", "usage"] },
  { id: "metrics", words: ["metric", "metrics", "studio", "reading", "readings"] },
  { id: "settings", words: ["setting", "settings", "account", "profile", "password"] },
  { id: "help", words: ["help", "support", "faq", "guide"] },
];

// System Information: two columns of three rows. `icon` keys map to icons in Dashboard.jsx.
export const SYSTEM_INFO = [
  [
    { icon: "os", label: "Operating System", value: "Windows 11" },
    { icon: "cpu", label: "Processor", value: "AMD Ryzen 5 7600X" },
    { icon: "gpu", label: "Graphics", value: "NVIDIA GeForce RTX 3070" },
  ],
  [
    { icon: "ram", label: "Installed RAM", value: "32 GB DDR5" },
    { icon: "storage", label: "Storage", value: "ST2000DM008 2 TB" },
    { icon: "updated", label: "Last Updated", value: "2026-11-14T09:24:00" },
  ],
];

// Gauge cards. The arc fills to value / max, and the badge turns to its warning
// text (and the arc to orange) once the value reaches `warnAt`. `colors` runs
// along the lit ticks and `rest` along the unlit ones; `more` is the page that
// "View more" opens. The CPU reading is also the banner's temperature chip.
const UNLIT = ["#3d3d43", "#2f2f34"]; // dim ticks on the dark glass cards
export const WARN_COLORS = { colors: ["#fb8a10", "#efa58c"], rest: UNLIT };
export const GAUGES = [
  {
    id: "cpu", title: "CPU", subtitle: "Ryzen 5 7600X", more: "sensors",
    value: 45, max: 100, unit: "°C", unitRaised: true, label: "Temperature",
    warnAt: 80, okText: "Normal", warnText: "Hot",
    colors: ["#19d873", "#1fe384"], rest: UNLIT,
  },
  {
    id: "gpu", title: "GPU", subtitle: "RTX 3070", more: "sensors",
    value: 32, max: 100, unit: "°C", unitRaised: true, label: "Temperature",
    warnAt: 80, okText: "Normal", warnText: "Hot",
    colors: ["#0bc6b5", "#10d695"], rest: UNLIT,
  },
  {
    id: "ram", title: "RAM", subtitle: "32 GB DDR5", more: "analytics",
    value: 92, max: 100, unit: "%", label: "Utilization",
    warnAt: 85, okText: "Normal", warnText: "High Usage",
    colors: ["#19d873", "#1fe384"], rest: UNLIT,
  },
  {
    id: "storage", title: "Storage", subtitle: "ST2000DM008\u20112F R102", more: "devices",
    value: 83, max: 100, unit: "%", label: "Utilization",
    warnAt: 90, okText: "Healthy", warnText: "Almost Full",
    colors: ["#a6d612", "#c6e02e"], rest: UNLIT,
  },
  {
    id: "power", title: "Power", subtitle: "System Power Draw", more: "live",
    value: 185, max: 400, unit: "W", label: "Power Draw",
    warnAt: 350, okText: "Normal", warnText: "High Draw",
    colors: ["#19d37a", "#22e08a"], rest: UNLIT,
  },
];

// Statistics chart history (placeholder). Each series is a smooth wave that
// ends exactly on the gauge's current reading, so "Now" always matches the
// card above it. Periods: 24 hourly points, 7 daily, 30 daily.
export const STAT_PERIODS = [
  { id: "24h", label: "24h", points: 24 },
  { id: "7d", label: "7d", points: 7 },
  { id: "30d", label: "30d", points: 30 },
];

const CHART_SHAPES = {
  cpu: { base: 50, amp: 8, colour: "#2fd27a" },
  gpu: { base: 40, amp: 9, colour: "#1fc9b8" },
  ram: { base: 76, amp: 8, colour: "#f59a3c" },
  storage: { base: 81, amp: 0.8, colour: "#b4dc2a" },
  power: { base: 205, amp: 45, colour: "#22e08a" },
};

function wave(points, base, amp, seed, end, max) {
  const raw = Array.from({ length: points }, (_, i) =>
    base + amp * Math.sin(i * 0.55 + seed) + amp * 0.45 * Math.sin(i * 1.7 + seed * 2));
  const drift = end - raw[points - 1];
  return raw.map((v, i) => {
    const shifted = v + drift * (i / Math.max(1, points - 1));
    return Math.round(Math.min(max, Math.max(0, shifted)));
  });
}

export const CHART_COLOURS = Object.fromEntries(Object.entries(CHART_SHAPES).map(([id, s]) => [id, s.colour]));
export const STAT_SERIES = Object.fromEntries(GAUGES.map((g, gi) => {
  const { base, amp } = CHART_SHAPES[g.id];
  return [g.id, Object.fromEntries(STAT_PERIODS.map((p, pi) =>
    [p.id, wave(p.points, base, amp, gi * 1.3 + pi * 0.9 + 0.4, g.value, g.max)]))];
}));
