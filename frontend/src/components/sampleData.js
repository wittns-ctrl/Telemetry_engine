// Sample data for frontend-only mode (BACKEND_DISABLED in services/api.js).
// Pages show it so the screens can be seen without the API. None of it is used
// once the backend is reconnected: every page then reads the real endpoints.

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const SAMPLE_DEVICES = [
  { id: "sample-pc", device_name: "My Windows PC", os_info: "Windows 11 · Desktop", last_seen: ago(3000), is_active: true },
  { id: "sample-laptop", device_name: "Office Laptop", os_info: "Windows 11 · Laptop", last_seen: ago(2 * HOUR), is_active: true },
];

// Shaped like TelemetrySnapshot in app/models/telemetry.py.
export const SAMPLE_SNAPSHOT = {
  timestamp: ago(3000),
  sensor_id: "lectio_sensor_001",
  cpu: { core_temperature_c: 45, package_temperature_c: 48, utilization_percent: 38, clock_speed_ghz: 4.7, package_power_w: 65, fan_speed_rpm: 1250, thermal_throttling: false },
  gpu: { core_temperature_c: 32, hotspot_temperature_c: 41, utilization_percent: 12, fan_speed_percent: 30, vram_used_gb: 2.1, vram_total_gb: 8, board_power_w: 48, gpu_name: "NVIDIA GeForce RTX 3070" },
  storage: [
    { device_name: "ST2000DM008", smart_health_percent: 96, total_bytes_written_tbw: 12.4, temperature_c: 34, reallocated_sector_count: 0, bad_sector_count: 0, available_capacity_gb: 340, total_capacity_gb: 2000 },
    { device_name: "Samsung SSD 980", smart_health_percent: 99, total_bytes_written_tbw: 4.2, temperature_c: 38, reallocated_sector_count: 0, bad_sector_count: 0, available_capacity_gb: 590, total_capacity_gb: 1000 },
  ],
  ram: { usage_percent: 92, used_gb: 29.4, total_gb: 32, pagefile_usage_percent: 34, whea_error_count: 0 },
  power_vrm: { vrm_temperature_c: 52, psu_12v_voltage: 12.08, chipset_temperature_c: 44, chassis_fan_speed_rpm: 900 },
};

// Countries for the dashboard map. The backend does not record where a PC is,
// so with the API connected the map has nothing to shade until it does.
export const SAMPLE_PLACES = [
  { country: "Rwanda", health: 89 },
  { country: "United Kingdom", health: 85 },
  { country: "Kenya", health: 82 },
  { country: "Germany", health: 80 },
  { country: "Nigeria", health: 79 },
  { country: "South Africa", health: 76 },
];

/** The last snapshot of a sample device, or null for the one that is offline. */
export const sampleSnapshot = (deviceId) => (deviceId === "sample-pc" ? SAMPLE_SNAPSHOT : null);

/** A smooth wave of `points` values that ends exactly on `end`. */
export function sampleWave(points, end, { seed = 0, swing = 0.14, min = 0, max = Infinity, digits = 0 } = {}) {
  if (!end) return Array.from({ length: points }, () => end);
  const amp = Math.max(Math.abs(end) * swing, 0.02);
  const raw = Array.from({ length: points }, (_, i) => end + amp * 0.3 + amp * Math.sin(i * 0.55 + seed) + amp * 0.45 * Math.sin(i * 1.7 + seed * 2));
  const drift = end - raw[points - 1];
  const scale = 10 ** digits;
  return raw.map((v, i) => {
    const shifted = Math.min(max, Math.max(min, v + drift * (i / Math.max(1, points - 1))));
    return Math.round(shifted * scale) / scale;
  });
}

export const SAMPLE_DEVICE_ALERTS = [
  { id: "sample-alert-1", device_id: "sample-pc", severity: "WARNING", rule_name: "ram_usage_high", metric_name: "ram_usage_percent", trigger_value: 92, threshold_limit: 85, message: "Memory usage is high: RAM has been at 92% for 5 minutes.", is_active: true, created_at: ago(2 * MIN) },
  { id: "sample-alert-2", device_id: "sample-pc", severity: "WARNING", rule_name: "cpu_core_temp_warning", metric_name: "cpu_core_temperature_c", trigger_value: 84, threshold_limit: 80, message: "CPU core temperature reached 84 °C under load.", is_active: true, created_at: ago(18 * MIN) },
];

export const SAMPLE_REPORT = {
  analysis_method: "rule_based",
  urgency_level: "MONITOR",
  root_cause_analysis: "This is a sample report, shown because the app is in frontend-only mode. With the backend connected, Lectio explains the alert from the readings around it.",
  actionable_steps: [
    { step_number: 1, instruction: "Close the apps you are not using and check Task Manager for anything using an unusual amount of memory.", category: "software", estimated_time_minutes: 5 },
    { step_number: 2, instruction: "If the reading stays high, restart the PC and watch it again.", category: "software", estimated_time_minutes: 5 },
  ],
};

// Legacy metric readings (Metrics Studio, Analytics, Sensors), newest first.
const SENSOR_ROTA = [
  ["sensor_room_204", "temperature", 24.5, { unit: "C" }],
  ["sensor_k8s_node_02", "cpu", 42, { core_count: 16, process_count: 180 }],
  ["sensor_edge_router_01", "network", 240, { bytes_sent: 52428800, bytes_recv: 104857600 }],
  ["sensor_datacenter_rack_a", "temperature", 31.2, { unit: "C" }],
  ["sensor_core_api_pod", "cpu", 64, { core_count: 32, process_count: 310 }],
  ["sensor_room_204", "temperature", 24.8, { unit: "C" }],
  ["sensor_gateway_primary", "network", 118, { bytes_sent: 8900000, bytes_recv: 19200000 }],
  ["sensor_k8s_node_02", "cpu", 91.5, { core_count: 16, process_count: 240 }],
];
export const SAMPLE_METRICS = Array.from({ length: 48 }, (_, i) => {
  const [sensor_id, metric_type, base, payload_data] = SENSOR_ROTA[i % SENSOR_ROTA.length];
  const value = Math.round(base * (1 + 0.06 * Math.sin(i * 1.3)) * 10) / 10;
  return { id: `sample-metric-${i}`, sensor_id, metric_type, value, payload_data, timestamp: ago(12000 + i * 29 * MIN + (i % 5) * 4 * MIN) };
});

export function statsOf(metrics) {
  const by_type = { temperature: 0, cpu: 0, network: 0 };
  metrics.forEach((m) => { by_type[m.metric_type] = (by_type[m.metric_type] || 0) + 1; });
  return { total_metrics: metrics.length, by_type, recent_sensors: [...new Set(metrics.slice(0, 100).map((m) => m.sensor_id))] };
}

export const SAMPLE_THRESHOLDS = { temperature: { max: 100 }, cpu: { max: 90 }, network: { max: 1000 } };

/** A minute of live readings and two alerts, so Live Monitor has something to draw before the simulator starts. */
export function sampleLive() {
  const now = Date.now();
  const rota = [["sensor_server_101", "temperature", 46], ["sensor_edge_node_4", "cpu", 41], ["sensor_gateway_01", "network", 420]];
  const metrics = Array.from({ length: 36 }, (_, i) => {
    const [sensor_id, metric_type, base] = rota[i % 3];
    const at = new Date(now - (36 - i) * 1700);
    return {
      id: `sample-live-${i}`,
      sensor_id,
      metric_type,
      value: Math.round(base * (1 + 0.16 * Math.sin(i * 0.7) + 0.07 * Math.sin(i * 2.3)) * 10) / 10,
      payload_data: metric_type === "temperature" ? { unit: "C" } : {},
      timestamp: at.toISOString(),
      alert_triggered: false,
      timeLabel: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  });
  const alerts = [
    { id: "sample-live-alert-1", receivedAt: new Date(now - 2 * MIN).toISOString(), severity: "CRITICAL", sensor_id: "sensor_core_api_pod", metric_type: "cpu", message: "CPU usage 98.6% is above the 90% limit.", current_value: 98.6, threshold_max: 90, unit: "%" },
    { id: "sample-live-alert-2", receivedAt: new Date(now - 18 * MIN).toISOString(), severity: "CRITICAL", sensor_id: "sensor_datacenter_rack_a", metric_type: "temperature", message: "Temperature 118.4°C is above the 100°C limit.", current_value: 118.4, threshold_max: 100, unit: "°C" },
  ];
  return { metrics, alerts };
}
