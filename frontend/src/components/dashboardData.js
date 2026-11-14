// Placeholder figures for the dashboard. The layout follows the reference
// template; the content is Lectio's own (PC hardware health). Nothing here
// comes from the API yet: these get replaced when the backend is reconnected.

export const HERO = {
  title: ["Intelligent", "PC Health"],
  subtitle: "Real-time hardware monitoring for every PC you own.",
  load: { label: ["CPU", "Load"], value: 64, unit: "%", from: "Idle", to: "Max" },
  temp: { label: ["CPU", "Temperature"], value: 72, unit: "°C" },
  kpis: [
    { value: "185", unit: "W", label: "Power draw" },
    { value: "98.4", unit: "%", label: "System health" },
  ],
};

// Two interleaved waves for the temperature card: CPU (green) and GPU (charcoal).
export const TEMP_WAVES = {
  cpu: [[0, 14], [12, 14], [22, 6], [34, 6], [44, 14], [56, 14], [66, 6], [78, 6], [88, 14], [100, 14]],
  gpu: [[0, 9], [14, 9], [24, 17], [36, 17], [46, 9], [58, 9], [68, 17], [80, 17], [90, 9], [100, 9]],
};

export const STATS = [
  { icon: "temp", value: "61.4", unit: "°C", change: "-4.6%", good: true, label: "Avg CPU Temp" },
  { icon: "gpu", value: "85.4", unit: "%", change: "+9.2%", good: false, label: "GPU Load" },
  { icon: "readings", value: "4,500", unit: "", change: "+4.5%", good: true, label: "Readings Today" },
];

// Readings received per day; the dot colour says how the day went.
export const DAY_STATUS = {
  peak: { label: "Peak", color: "#5cc061" },
  steady: { label: "Steady", color: "#1c1c1f" },
  alerts: { label: "Alerts", color: "#ec003f" },
  offline: { label: "Offline", color: "#b9b9bf" },
};
export const READINGS = {
  Week: [
    { day: "Mo", value: 1520, status: "alerts" },
    { day: "Tu", value: 1880, status: "steady" },
    { day: "We", value: 2345, status: "peak" },
    { day: "Th", value: 820, status: "offline" },
    { day: "Fr", value: 1390, status: "alerts" },
    { day: "Sa", value: 1740, status: "steady" },
    { day: "Su", value: 1440, status: "alerts" },
  ],
  "Last week": [
    { day: "Mo", value: 1610, status: "steady" },
    { day: "Tu", value: 1430, status: "alerts" },
    { day: "We", value: 1720, status: "steady" },
    { day: "Th", value: 1980, status: "steady" },
    { day: "Fr", value: 2210, status: "peak" },
    { day: "Sa", value: 960, status: "offline" },
    { day: "Su", value: 1150, status: "alerts" },
  ],
};

// Tags at the ends of the leader lines, in the illustration's 150 × 108 units.
export const HEALTH_TAGS = [
  { label: "CPU", x: 40, y: 16, align: "above" },
  { label: "GPU", x: 128, y: 58, align: "below" },
  { label: "Power Supply", x: 22, y: 74, align: "below" },
];

export const THERMAL = [
  { device: "Gaming PC", part: "CPU Package", level: "High heat", percent: 89, hot: ["cpu", "gpu"] },
  { device: "Work Laptop", part: "CPU Package", level: "Normal", percent: 54, hot: ["cpu", "ram"] },
  { device: "Home Server", part: "Drives", level: "Warm", percent: 67, hot: ["ssd", "chipset", "psu"] },
];

// Average daily use, as bar heights in the reference's pixels: [CPU, Memory, Disk].
export const USAGE_SERIES = [
  { key: "cpu", label: "CPU", color: "#1c1c1f" },
  { key: "mem", label: "Memory", color: "#5cc061" },
  { key: "disk", label: "Disk", color: "#e2e2df" },
];
export const USAGE = {
  Week: [
    { day: "Mo", cpu: 17.5, mem: 22, disk: 21.5 },
    { day: "Tu", cpu: 22.5, mem: 34, disk: 21.5 },
    { day: "We", cpu: 14, mem: 16, disk: 17 },
    { day: "Th", cpu: 13.5, mem: 19, disk: 17 },
    { day: "Fr", cpu: 23, mem: 21, disk: 21 },
    { day: "Sa", cpu: 15.5, mem: 15, disk: 16 },
    { day: "Su", cpu: 10.5, mem: 29, disk: 18 },
  ],
  "Last week": [
    { day: "Mo", cpu: 19, mem: 25, disk: 18 },
    { day: "Tu", cpu: 16, mem: 22, disk: 20 },
    { day: "We", cpu: 21, mem: 30, disk: 19 },
    { day: "Th", cpu: 12, mem: 18, disk: 16 },
    { day: "Fr", cpu: 18, mem: 24, disk: 22 },
    { day: "Sa", cpu: 9, mem: 14, disk: 15 },
    { day: "Su", cpu: 11, mem: 20, disk: 17 },
  ],
};
