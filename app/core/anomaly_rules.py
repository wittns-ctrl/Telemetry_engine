"""
Anomaly Detection Rules Configuration

The threshold rules every reading is checked against. Values follow published
limits where they exist (Intel/AMD TjMax, NVIDIA/AMD GPU limits, ATX12V rail
tolerances, NVMe health semantics, Microsoft guidance on commit charge and the
page file); see docs/alert-thresholds.md for the reasoning and sources.

Severity means what the user should do:
  CRITICAL  risk of damage, data loss, a crash or a shutdown: act now
  WARNING   worth a look soon: something is wearing, filling up or running hot
  INFO      normal-but-notable load: no action needed

Readings arrive every 5 seconds, so durations are multiples of 5 s. Where the
real limit depends on the exact hardware (a CPU's TjMax, a GPU's maximum), the
rules use a safe generic default until the agent reports the device's own.

Author: Lectio Backend Team
Version: 5.0.0
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, Callable
from enum import Enum

from app.models.alert import AlertSeverity
from app.models.telemetry import TelemetrySnapshot


class ComparisonOperator(str, Enum):
    """Comparison operators for threshold evaluation."""
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_THAN_OR_EQUAL = ">="
    LESS_THAN_OR_EQUAL = "<="


@dataclass
class AnomalyRule:
    """
    Definition of an anomaly detection rule.

    Attributes:
        name: Unique identifier for the rule
        severity: Severity level when triggered
        metric_name: Name of the metric to monitor
        threshold: Threshold value for triggering
        operator: Comparison operator
        duration_threshold: Minimum duration (seconds) before triggering
        resolution_duration: Minimum duration (seconds) back in range before auto-resolution
        message_template: Template for alert message
        metric_extractor: Function to extract metric value from TelemetrySnapshot;
            None means "not measured, or the rule doesn't apply right now"
    """
    name: str
    severity: AlertSeverity
    metric_name: str
    threshold: float
    operator: ComparisonOperator
    duration_threshold: float  # seconds
    resolution_duration: float  # seconds
    message_template: str
    metric_extractor: Callable[[TelemetrySnapshot], Optional[float]]
    # Optional: the message's detail from the reading itself (a threat's name,
    # say), used as {detail} in the template.
    detail: Optional[Callable[[TelemetrySnapshot], str]] = None

    def message(self, value: float, snapshot: Optional[TelemetrySnapshot] = None) -> str:
        detail = ""
        if self.detail is not None and snapshot is not None:
            try:
                detail = self.detail(snapshot)
            except Exception:  # a message is never worth failing an alert over
                detail = ""
        return self.message_template.format(value=value, threshold=self.threshold, detail=detail)[:512]


GT = ComparisonOperator.GREATER_THAN
GE = ComparisonOperator.GREATER_THAN_OR_EQUAL
LT = ComparisonOperator.LESS_THAN
LE = ComparisonOperator.LESS_THAN_OR_EQUAL
CRITICAL, WARNING, INFO = AlertSeverity.CRITICAL, AlertSeverity.WARNING, AlertSeverity.INFO

DAY = 24 * 60 * 60

# Generic limits used until the agent reports the hardware's own.
CPU_TJMAX_C = 100.0          # Intel desktop/mobile Core; many AMD Ryzen parts are 95 °C
GPU_FAN_STOP_WARN_C = 65.0   # 0-RPM fan stop is normal below about this
GPU_FAN_STOP_CRIT_C = 75.0
SYSTEM_DRIVE = "C:"


# ---------------------------------------------------------------- extractors

def extract_cpu_core_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.cpu.core_temperature_c


def extract_cpu_package_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.cpu.package_temperature_c


def extract_cpu_throttling(snapshot: TelemetrySnapshot) -> Optional[float]:
    throttling = snapshot.cpu.thermal_throttling
    return None if throttling is None else float(throttling)


def extract_gpu_core_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.gpu.core_temperature_c


def extract_gpu_hotspot_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.gpu.hotspot_temperature_c


def _gpu_fan_when_hotter_than(limit_c: float) -> Callable[[TelemetrySnapshot], Optional[float]]:
    """The GPU fan speed, but only while the GPU is hotter than limit_c: a
    stopped fan on a cool GPU is the normal 0-RPM mode, not a fault."""
    def extract(snapshot: TelemetrySnapshot) -> Optional[float]:
        temp, fan = snapshot.gpu.core_temperature_c, snapshot.gpu.fan_speed_percent
        if temp is None or fan is None or temp < limit_c:
            return None
        return fan
    return extract


def extract_vram_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    used, total = snapshot.gpu.vram_used_gb, snapshot.gpu.vram_total_gb
    if used is None or not total:
        return None
    return used / total * 100


def extract_gpu_utilization(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.gpu.utilization_percent


def extract_cpu_utilization(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.cpu.utilization_percent


def extract_psu_12v_voltage(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.power_vrm.psu_12v_voltage


def extract_vrm_temperature(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.power_vrm.vrm_temperature_c


def extract_chipset_temperature(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.power_vrm.chipset_temperature_c


def extract_chassis_fan_when_hot(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Chassis fan speed while the CPU or GPU is at 75 °C or more."""
    rpm = snapshot.power_vrm.chassis_fan_speed_rpm
    temps = [t for t in (snapshot.cpu.core_temperature_c, snapshot.gpu.core_temperature_c) if t is not None]
    if rpm is None or not temps or max(temps) < 75.0:
        return None
    return float(rpm)


def extract_ram_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.ram.usage_percent


def extract_commit_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    committed, limit = snapshot.ram.committed_gb, snapshot.ram.commit_limit_gb
    if committed is None or not limit:
        return None
    return committed / limit * 100


def extract_pagefile_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.ram.pagefile_usage_percent


def extract_whea_error_count(snapshot: TelemetrySnapshot) -> Optional[float]:
    return float(snapshot.ram.whea_error_count)


def extract_nvme_health_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Remaining drive life (100 = new), the worst drive."""
    values = [s.smart_health_percent for s in snapshot.storage if s.smart_health_percent is not None]
    return min(values) if values else None


def extract_bad_sectors(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Reallocated plus bad sectors on the worst drive."""
    counts = [
        (s.reallocated_sector_count or 0) + (s.bad_sector_count or 0)
        for s in snapshot.storage
        if s.reallocated_sector_count is not None or s.bad_sector_count is not None
    ]
    return float(max(counts)) if counts else None


def extract_drive_temperature(snapshot: TelemetrySnapshot) -> Optional[float]:
    values = [s.temperature_c for s in snapshot.storage if s.temperature_c is not None]
    return max(values) if values else None


def extract_fullest_drive_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    values = [
        (1 - s.available_capacity_gb / s.total_capacity_gb) * 100
        for s in snapshot.storage
        if s.available_capacity_gb is not None and s.total_capacity_gb
    ]
    return max(values) if values else None


def extract_system_drive_free_gb(snapshot: TelemetrySnapshot) -> Optional[float]:
    for s in snapshot.storage:
        if (s.device_name or "").rstrip("\\/").upper() == SYSTEM_DRIVE and s.available_capacity_gb is not None:
            return s.available_capacity_gb
    return None


def extract_disk_active(snapshot: TelemetrySnapshot) -> Optional[float]:
    return snapshot.disk.active_percent


def extract_network_link_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    """The busier direction as a share of the adapter's link speed."""
    net = snapshot.network
    if not net.link_speed_mbps:
        return None
    rates = [r for r in (net.receive_bytes_per_s, net.send_bytes_per_s) if r is not None]
    if not rates:
        return None
    return max(rates) * 8 / (net.link_speed_mbps * 1_000_000) * 100


def extract_process_count(snapshot: TelemetrySnapshot) -> Optional[float]:
    return None if snapshot.cpu.process_count is None else float(snapshot.cpu.process_count)


def extract_thread_count(snapshot: TelemetrySnapshot) -> Optional[float]:
    return None if snapshot.cpu.thread_count is None else float(snapshot.cpu.thread_count)


def extract_handle_count(snapshot: TelemetrySnapshot) -> Optional[float]:
    return None if snapshot.cpu.handle_count is None else float(snapshot.cpu.handle_count)


def extract_uptime_days(snapshot: TelemetrySnapshot) -> Optional[float]:
    up = snapshot.cpu.uptime_seconds
    return None if up is None else up / DAY


# --------------------------------------------------------------- security

def _antivirus_is_defender(snapshot: TelemetrySnapshot) -> bool:
    sec = snapshot.security
    return sec is not None and bool(sec.defender_active) and not sec.other_antivirus


def extract_active_threats(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Threats still on the PC that Defender hasn't dealt with."""
    sec = snapshot.security
    return None if sec is None else float(sum(1 for t in sec.threats if t.active))


def _recently_stopped(snapshot: TelemetrySnapshot):
    since = snapshot.timestamp - timedelta(days=1)
    return [t for t in snapshot.security.threats
            if not t.active and _aware(t.detected_at) >= _aware(since)]


def extract_recently_stopped_threats(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Threats Defender caught and dealt with in the last 24 hours."""
    return None if snapshot.security is None else float(len(_recently_stopped(snapshot)))


def extract_protection_off(snapshot: TelemetrySnapshot) -> Optional[float]:
    """1 when real-time protection is off and no other antivirus is on."""
    sec = snapshot.security
    if sec is None or sec.realtime_protection is None:
        return None
    return 0.0 if sec.realtime_protection or sec.other_antivirus else 1.0


def extract_definitions_age(snapshot: TelemetrySnapshot) -> Optional[float]:
    if not _antivirus_is_defender(snapshot) or snapshot.security.definitions_age_days is None:
        return None
    return float(snapshot.security.definitions_age_days)


def extract_quick_scan_age(snapshot: TelemetrySnapshot) -> Optional[float]:
    if not _antivirus_is_defender(snapshot) or snapshot.security.quick_scan_age_days is None:
        return None
    return float(snapshot.security.quick_scan_age_days)


def extract_disguised_programs(snapshot: TelemetrySnapshot) -> Optional[float]:
    sec = snapshot.security
    return None if sec is None else float(len(sec.suspicious_processes))


def _and_more(names: list[str]) -> str:
    if not names:
        return ""
    return names[0] + (f" and {len(names) - 1} more" if len(names) > 1 else "")


def detail_active_threats(snapshot: TelemetrySnapshot) -> str:
    return _and_more([t.name for t in sorted(snapshot.security.threats, key=lambda t: t.detected_at, reverse=True)
                      if t.active])


def detail_recently_stopped(snapshot: TelemetrySnapshot) -> str:
    stopped = sorted(_recently_stopped(snapshot), key=lambda t: t.detected_at, reverse=True)
    return _and_more(list(dict.fromkeys(t.name for t in stopped)))  # each name once


def detail_disguised(snapshot: TelemetrySnapshot) -> str:
    p = snapshot.security.suspicious_processes[0]
    more = len(snapshot.security.suspicious_processes) - 1
    return f"{p.name} running from {p.path}" + (f" and {more} more" if more > 0 else "")


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _rule(name, severity, metric, op, threshold, last, clears, message, extractor, detail=None) -> AnomalyRule:
    return AnomalyRule(
        name=name, severity=severity, metric_name=metric, threshold=threshold, operator=op,
        duration_threshold=float(last), resolution_duration=float(clears),
        message_template=message, metric_extractor=extractor, detail=detail,
    )


# ------------------------------------------------------------------- rules

BASELINE_RULES = [
    # CPU: TjMax - 15 °C is high, TjMax - 5 °C is at the edge (default TjMax 100 °C).
    _rule("CPU_OVERHEATING_CRITICAL", CRITICAL, "cpu_core_temperature_c", GE, CPU_TJMAX_C - 5, 30, 30,
          "CPU core temperature critical: {value:.1f}°C at or above {threshold:.1f}°C", extract_cpu_core_temp),
    _rule("CPU_OVERHEATING_WARNING", WARNING, "cpu_core_temperature_c", GE, CPU_TJMAX_C - 15, 30, 30,
          "CPU core temperature elevated: {value:.1f}°C at or above {threshold:.1f}°C", extract_cpu_core_temp),
    _rule("CPU_PACKAGE_OVERHEATING_CRITICAL", CRITICAL, "cpu_package_temperature_c", GE, CPU_TJMAX_C, 30, 30,
          "CPU package at its limit: {value:.1f}°C at or above {threshold:.1f}°C", extract_cpu_package_temp),
    _rule("CPU_PACKAGE_OVERHEATING_WARNING", WARNING, "cpu_package_temperature_c", GE, CPU_TJMAX_C - 10, 30, 30,
          "CPU package temperature elevated: {value:.1f}°C at or above {threshold:.1f}°C", extract_cpu_package_temp),
    _rule("CPU_THERMAL_THROTTLING_WARNING", WARNING, "cpu_thermal_throttling", GE, 1, 30, 30,
          "CPU is slowing itself down to cool off (thermal throttling)", extract_cpu_throttling),
    _rule("CPU_HIGH_UTILIZATION_INFO", INFO, "cpu_utilization_percent", GT, 90, 60, 30,
          "CPU utilization high: {value:.1f}% exceeds threshold {threshold:.1f}%", extract_cpu_utilization),

    # GPU
    _rule("GPU_CORE_OVERHEATING_CRITICAL", CRITICAL, "gpu_core_temperature_c", GE, 93, 30, 30,
          "GPU core temperature critical: {value:.1f}°C at or above {threshold:.1f}°C", extract_gpu_core_temp),
    _rule("GPU_CORE_OVERHEATING_WARNING", WARNING, "gpu_core_temperature_c", GE, 85, 30, 30,
          "GPU core temperature elevated: {value:.1f}°C at or above {threshold:.1f}°C", extract_gpu_core_temp),
    _rule("GPU_HOTSPOT_CRITICAL", CRITICAL, "gpu_hotspot_temperature_c", GE, 108, 30, 30,
          "GPU hotspot temperature critical: {value:.1f}°C at or above {threshold:.1f}°C", extract_gpu_hotspot_temp),
    _rule("GPU_HOTSPOT_WARNING", WARNING, "gpu_hotspot_temperature_c", GE, 100, 30, 30,
          "GPU hotspot temperature elevated: {value:.1f}°C at or above {threshold:.1f}°C", extract_gpu_hotspot_temp),
    _rule("GPU_FAN_STOPPED_CRITICAL", CRITICAL, "gpu_fan_speed_percent", LE, 0, 20, 30,
          f"GPU fan isn't spinning while the GPU is at {GPU_FAN_STOP_CRIT_C:.0f}°C or more",
          _gpu_fan_when_hotter_than(GPU_FAN_STOP_CRIT_C)),
    _rule("GPU_FAN_STOPPED_WARNING", WARNING, "gpu_fan_speed_percent", LE, 0, 20, 30,
          f"GPU fan isn't spinning while the GPU is at {GPU_FAN_STOP_WARN_C:.0f}°C or more",
          _gpu_fan_when_hotter_than(GPU_FAN_STOP_WARN_C)),
    # Games and creative apps fill video memory on purpose, so only a nearly
    # full card for a while is worth a warning (never critical).
    _rule("GPU_VRAM_FULL_WARNING", WARNING, "gpu_vram_used_percent", GE, 95, 30, 30,
          "GPU memory almost full: {value:.0f}% in use", extract_vram_percent),
    _rule("GPU_HIGH_UTILIZATION_INFO", INFO, "gpu_utilization_percent", GT, 95, 60, 30,
          "GPU utilization high: {value:.1f}% exceeds threshold {threshold:.1f}%", extract_gpu_utilization),

    # Motherboard and power. ATX12V: +12 V within ±5 % (11.40-12.60 V); some
    # load conditions are allowed down to -7 % (11.16 V).
    _rule("PSU_12V_UNDERVOLTAGE_CRITICAL", CRITICAL, "psu_12v_voltage", LT, 11.16, 15, 30,
          "PSU +12V rail undervoltage critical: {value:.2f}V below {threshold:.2f}V", extract_psu_12v_voltage),
    _rule("PSU_12V_UNDERVOLTAGE_WARNING", WARNING, "psu_12v_voltage", LT, 11.40, 15, 30,
          "PSU +12V rail low: {value:.2f}V below {threshold:.2f}V", extract_psu_12v_voltage),
    _rule("PSU_12V_OVERVOLTAGE_CRITICAL", CRITICAL, "psu_12v_voltage", GT, 12.60, 15, 30,
          "PSU +12V rail overvoltage critical: {value:.2f}V above {threshold:.2f}V", extract_psu_12v_voltage),
    _rule("VRM_OVERHEATING_CRITICAL", CRITICAL, "vrm_temperature_c", GE, 100, 30, 30,
          "VRM temperature critical: {value:.1f}°C at or above {threshold:.1f}°C", extract_vrm_temperature),
    _rule("VRM_OVERHEATING_WARNING", WARNING, "vrm_temperature_c", GE, 85, 30, 30,
          "VRM temperature elevated: {value:.1f}°C at or above {threshold:.1f}°C", extract_vrm_temperature),
    _rule("CHIPSET_OVERHEATING_CRITICAL", CRITICAL, "chipset_temperature_c", GE, 85, 30, 30,
          "Chipset temperature critical: {value:.1f}°C at or above {threshold:.1f}°C", extract_chipset_temperature),
    _rule("CHIPSET_OVERHEATING_WARNING", WARNING, "chipset_temperature_c", GE, 75, 30, 30,
          "Chipset temperature elevated: {value:.1f}°C at or above {threshold:.1f}°C", extract_chipset_temperature),
    _rule("CHASSIS_FAN_STOPPED_CRITICAL", CRITICAL, "chassis_fan_speed_rpm", LT, 200, 20, 30,
          "Case fan at {value:.0f} RPM while the PC is running hot", extract_chassis_fan_when_hot),

    # Memory. Hitting the commit limit makes programs fail to get memory.
    _rule("RAM_USAGE_CRITICAL", CRITICAL, "ram_usage_percent", GE, 95, 60, 30,
          "Memory almost full: {value:.0f}% in use", extract_ram_percent),
    _rule("RAM_USAGE_WARNING", WARNING, "ram_usage_percent", GE, 85, 60, 30,
          "Memory use high: {value:.0f}% in use", extract_ram_percent),
    _rule("COMMIT_CHARGE_CRITICAL", CRITICAL, "commit_charge_percent", GE, 95, 30, 30,
          "Windows is about to run out of memory to hand out: {value:.0f}% of the commit limit", extract_commit_percent),
    _rule("COMMIT_CHARGE_WARNING", WARNING, "commit_charge_percent", GE, 85, 30, 30,
          "Committed memory high: {value:.0f}% of the commit limit", extract_commit_percent),
    _rule("PAGEFILE_USAGE_CRITICAL", CRITICAL, "pagefile_usage_percent", GE, 90, 60, 30,
          "Page file almost full: {value:.0f}% in use", extract_pagefile_percent),
    _rule("PAGEFILE_USAGE_WARNING", WARNING, "pagefile_usage_percent", GE, 70, 60, 30,
          "Page file use high: {value:.0f}% in use", extract_pagefile_percent),

    # Storage. smart_health_percent is remaining life (100 = new), i.e.
    # 100 minus NVMe "Percentage Used".
    _rule("NVME_HEALTH_CRITICAL", CRITICAL, "nvme_smart_health_percent", LE, 5, 60, 60,
          "Drive nearly worn out: {value:.0f}% life left", extract_nvme_health_percent),
    _rule("NVME_HEALTH_LOW_WARNING", WARNING, "nvme_smart_health_percent", LE, 20, 60, 60,
          "Drive wearing out: {value:.0f}% life left", extract_nvme_health_percent),
    # Sector counts never go down, so these stay open until the drive is replaced.
    _rule("DRIVE_BAD_SECTORS_CRITICAL", CRITICAL, "drive_bad_sectors", GE, 10, 60, 60,
          "Drive has {value:.0f} bad or reallocated sectors: back up now", extract_bad_sectors),
    _rule("DRIVE_BAD_SECTORS_WARNING", WARNING, "drive_bad_sectors", GE, 1, 60, 60,
          "Drive has {value:.0f} bad or reallocated sector(s)", extract_bad_sectors),
    # SSD/NVMe limits; hard drives are rated lower (about 55-60 °C) but the
    # agent doesn't yet say which kind a drive is.
    _rule("DRIVE_OVERHEATING_CRITICAL", CRITICAL, "drive_temperature_c", GE, 80, 60, 60,
          "Drive temperature critical: {value:.0f}°C at or above {threshold:.0f}°C", extract_drive_temperature),
    _rule("DRIVE_OVERHEATING_WARNING", WARNING, "drive_temperature_c", GE, 70, 60, 60,
          "Drive running hot: {value:.0f}°C at or above {threshold:.0f}°C", extract_drive_temperature),
    _rule("DISK_FULL_CRITICAL", CRITICAL, "drive_used_percent", GE, 95, 60, 60,
          "A drive is almost full: {value:.0f}% used", extract_fullest_drive_percent),
    _rule("DISK_FULL_WARNING", WARNING, "drive_used_percent", GE, 85, 60, 60,
          "A drive is filling up: {value:.0f}% used", extract_fullest_drive_percent),
    _rule("SYSTEM_DRIVE_SPACE_CRITICAL", CRITICAL, "system_drive_free_gb", LT, 5, 60, 60,
          "Only {value:.1f} GB free on the Windows drive (C:)", extract_system_drive_free_gb),
    _rule("SYSTEM_DRIVE_SPACE_WARNING", WARNING, "system_drive_free_gb", LT, 15, 60, 60,
          "Only {value:.1f} GB free on the Windows drive (C:)", extract_system_drive_free_gb),
    # Busy time alone doesn't prove a slow disk (that needs latency), so INFO only.
    _rule("DISK_BUSY_INFO", INFO, "disk_active_percent", GE, 95, 180, 60,
          "Disk busy {value:.0f}% of the time for several minutes", extract_disk_active),

    # System. WHEA: Windows hardware error reports.
    _rule("WHEA_ERRORS_CRITICAL", CRITICAL, "whea_error_count", GE, 10, 5, 300,
          "Windows reported {value:.0f} hardware errors", extract_whea_error_count),
    _rule("WHEA_ERROR_SPIKE_WARNING", WARNING, "whea_error_count", GE, 3, 5, 300,
          "WHEA hardware errors detected: {value:.0f} errors in monitoring window", extract_whea_error_count),
    _rule("HANDLE_COUNT_CRITICAL", CRITICAL, "handle_count", GT, 600_000, 120, 60,
          "{value:,.0f} open handles: a program is probably leaking them", extract_handle_count),
    _rule("HANDLE_COUNT_WARNING", WARNING, "handle_count", GT, 300_000, 120, 60,
          "{value:,.0f} open handles, far more than usual", extract_handle_count),
    _rule("THREAD_COUNT_CRITICAL", CRITICAL, "thread_count", GT, 15_000, 120, 60,
          "{value:,.0f} threads running: a program is probably leaking them", extract_thread_count),
    _rule("THREAD_COUNT_WARNING", WARNING, "thread_count", GT, 8_000, 120, 60,
          "{value:,.0f} threads running, far more than usual", extract_thread_count),
    _rule("PROCESS_COUNT_CRITICAL", CRITICAL, "process_count", GT, 800, 120, 60,
          "{value:,.0f} processes running, far more than a PC normally has", extract_process_count),
    _rule("PROCESS_COUNT_WARNING", WARNING, "process_count", GT, 400, 120, 60,
          "{value:,.0f} processes running, more than usual", extract_process_count),
    # Not restarting skips updates and lets leaks build up; not a hardware risk.
    _rule("UPTIME_LONG_WARNING", WARNING, "uptime_days", GE, 60, 60, 5,
          "Not restarted for {value:.0f} days: restart to finish updates", extract_uptime_days),
    _rule("UPTIME_LONG_INFO", INFO, "uptime_days", GE, 30, 60, 5,
          "Not restarted for {value:.0f} days", extract_uptime_days),

    # Security (Microsoft Defender, or the other antivirus that replaced it).
    _rule("SECURITY_THREAT_ACTIVE_CRITICAL", CRITICAL, "security_active_threats", GE, 1, 5, 60,
          "Malware found: {detail}", extract_active_threats, detail_active_threats),
    _rule("SECURITY_THREAT_STOPPED_WARNING", WARNING, "security_recent_threats", GE, 1, 5, 60,
          "Defender stopped malware: {detail}", extract_recently_stopped_threats, detail_recently_stopped),
    _rule("SECURITY_PROTECTION_OFF_CRITICAL", CRITICAL, "security_protection_off", GE, 1, 15, 15,
          "Real-time virus protection is off", extract_protection_off),
    _rule("SECURITY_DISGUISED_PROGRAM_CRITICAL", CRITICAL, "security_disguised_programs", GE, 1, 5, 60,
          "Program disguised as part of Windows: {detail}", extract_disguised_programs, detail_disguised),
    _rule("SECURITY_DEFINITIONS_OLD_CRITICAL", CRITICAL, "security_definitions_age_days", GE, 7, 60, 5,
          "Virus definitions are {value:.0f} days old", extract_definitions_age),
    _rule("SECURITY_DEFINITIONS_OLD_WARNING", WARNING, "security_definitions_age_days", GE, 3, 60, 5,
          "Virus definitions are {value:.0f} days old", extract_definitions_age),
    _rule("SECURITY_SCAN_OLD_CRITICAL", CRITICAL, "security_quick_scan_age_days", GT, 30, 60, 5,
          "No virus scan for {value:.0f} days", extract_quick_scan_age),
    _rule("SECURITY_SCAN_OLD_WARNING", WARNING, "security_quick_scan_age_days", GT, 14, 60, 5,
          "No virus scan for {value:.0f} days", extract_quick_scan_age),

    # Network: a big download fills the link on purpose, so INFO only.
    _rule("NETWORK_SATURATED_INFO", INFO, "network_link_percent", GE, 95, 60, 30,
          "Network connection full: {value:.0f}% of the link speed in use", extract_network_link_percent),
]


def get_rule_by_name(rule_name: str) -> Optional[AnomalyRule]:
    """Retrieve a rule by its name (None if there is no such rule)."""
    for rule in BASELINE_RULES:
        if rule.name == rule_name:
            return rule
    return None


def evaluate_rule(rule: AnomalyRule, value: float) -> bool:
    """True if value breaches the rule's threshold."""
    if rule.operator == ComparisonOperator.GREATER_THAN:
        return value > rule.threshold
    elif rule.operator == ComparisonOperator.LESS_THAN:
        return value < rule.threshold
    elif rule.operator == ComparisonOperator.GREATER_THAN_OR_EQUAL:
        return value >= rule.threshold
    elif rule.operator == ComparisonOperator.LESS_THAN_OR_EQUAL:
        return value <= rule.threshold
    return False
