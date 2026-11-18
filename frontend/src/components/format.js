// Small formatting helpers shared by the signed-in pages.

export const cx = (...names) => names.filter(Boolean).join(" ");

/** A number with fixed decimals and a suffix, or a dash when there is no reading. */
export function fmt(value, digits = 0, suffix = "") {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
}

export function timeAgo(iso) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

export function initialsFor(name) {
  const base = (name || "").split("@")[0].trim();
  if (!base) return "?";
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2)).toUpperCase();
}

/** "Temperature", "CPU usage" and "Network": the three legacy reading types. */
export const METRIC_TYPES = [
  { id: "temperature", label: "Temperature", unit: "°C" },
  { id: "cpu", label: "CPU usage", unit: "%" },
  { id: "network", label: "Network", unit: " MB/s" },
];

export const metricType = (id) => METRIC_TYPES.find((t) => t.id === id) || { id, label: id, unit: "" };

/** A legacy reading's value with its unit: "24.5°C", "42%", "240 MB/s". */
export function metricValue(m) {
  if (m.metric_type === "temperature") return `${m.value}°${m.payload_data?.unit || "C"}`;
  return `${m.value}${metricType(m.metric_type).unit}`;
}
