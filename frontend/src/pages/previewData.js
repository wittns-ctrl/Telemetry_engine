// Made-up readings for the landing page's product preview (DashboardPreview.jsx).
// Marketing artwork only: the signed-in app always reads the real API.

const ago = (ms) => new Date(Date.now() - ms).toISOString();

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

// Countries shaded on the preview's map.
export const SAMPLE_PLACES = [
  { country: "Rwanda", health: 89 },
  { country: "United Kingdom", health: 85 },
  { country: "Kenya", health: 82 },
  { country: "Germany", health: 80 },
  { country: "Nigeria", health: 79 },
  { country: "South Africa", health: 76 },
];
