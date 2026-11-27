"""The alert rules' own arithmetic: ratios, conditions and which way a limit points."""

from datetime import datetime, timezone

import pytest

from app.core.anomaly_rules import BASELINE_RULES, evaluate_rule, get_rule_by_name
from app.models.telemetry import (
    CPUMetrics, GPUMetrics, NetworkMetrics, PowerAndVRMMetrics, RAMMetrics, StorageMetrics, TelemetrySnapshot,
)


def snap(**parts) -> TelemetrySnapshot:
    base = dict(
        timestamp=datetime.now(timezone.utc), sensor_id="test-pc",
        cpu=CPUMetrics(), gpu=GPUMetrics(), storage=[], ram=RAMMetrics(), power_vrm=PowerAndVRMMetrics(),
    )
    base.update(parts)
    return TelemetrySnapshot(**base)


def fires(rule_name: str, snapshot: TelemetrySnapshot) -> bool:
    rule = get_rule_by_name(rule_name)
    value = rule.metric_extractor(snapshot)
    return value is not None and evaluate_rule(rule, value)


def test_rule_names_are_unique_and_messages_format():
    names = [r.name for r in BASELINE_RULES]
    assert len(names) == len(set(names))
    for rule in BASELINE_RULES:
        rule.message(1.0)


def test_every_rule_ignores_an_empty_reading():
    # A PC that reports nothing for a part mustn't raise alerts about it.
    empty = snap()
    for rule in BASELINE_RULES:
        if rule.name.startswith("WHEA_"):
            continue  # the count defaults to 0, which is below both limits
        assert rule.metric_extractor(empty) is None, rule.name


@pytest.mark.parametrize("temp, warning, critical", [(84, False, False), (85, True, False), (95, True, True)])
def test_cpu_core_temperature_uses_tjmax_minus_15_and_5(temp, warning, critical):
    s = snap(cpu=CPUMetrics(core_temperature_c=temp))
    assert fires("CPU_OVERHEATING_WARNING", s) is warning
    assert fires("CPU_OVERHEATING_CRITICAL", s) is critical


def test_a_stopped_gpu_fan_only_counts_when_the_gpu_is_hot():
    cool = snap(gpu=GPUMetrics(core_temperature_c=50, fan_speed_percent=0))
    warm = snap(gpu=GPUMetrics(core_temperature_c=70, fan_speed_percent=0))
    hot = snap(gpu=GPUMetrics(core_temperature_c=80, fan_speed_percent=0))
    spinning = snap(gpu=GPUMetrics(core_temperature_c=80, fan_speed_percent=40))
    assert not fires("GPU_FAN_STOPPED_WARNING", cool)  # normal 0-RPM mode
    assert fires("GPU_FAN_STOPPED_WARNING", warm) and not fires("GPU_FAN_STOPPED_CRITICAL", warm)
    assert fires("GPU_FAN_STOPPED_CRITICAL", hot)
    assert not fires("GPU_FAN_STOPPED_CRITICAL", spinning)


def test_vram_is_a_share_of_the_card():
    assert fires("GPU_VRAM_FULL_WARNING", snap(gpu=GPUMetrics(vram_used_gb=7.7, vram_total_gb=8)))
    assert not fires("GPU_VRAM_FULL_WARNING", snap(gpu=GPUMetrics(vram_used_gb=7.0, vram_total_gb=8)))


def test_commit_charge_is_a_share_of_the_limit():
    s = snap(ram=RAMMetrics(committed_gb=31, commit_limit_gb=32))
    assert fires("COMMIT_CHARGE_CRITICAL", s)


@pytest.mark.parametrize("volts, warning, critical", [(12.0, False, False), (11.3, True, False), (11.1, True, True)])
def test_psu_12v_follows_atx_tolerances(volts, warning, critical):
    s = snap(power_vrm=PowerAndVRMMetrics(psu_12v_voltage=volts))
    assert fires("PSU_12V_UNDERVOLTAGE_WARNING", s) is warning
    assert fires("PSU_12V_UNDERVOLTAGE_CRITICAL", s) is critical


def test_drive_health_is_remaining_life():
    worn = snap(storage=[StorageMetrics(device_name="C:", smart_health_percent=15),
                         StorageMetrics(device_name="D:", smart_health_percent=90)])
    assert fires("NVME_HEALTH_LOW_WARNING", worn)
    assert not fires("NVME_HEALTH_CRITICAL", worn)


def test_free_space_floor_is_for_the_windows_drive():
    c_low = snap(storage=[StorageMetrics(device_name="C:\\", available_capacity_gb=4, total_capacity_gb=500)])
    d_low = snap(storage=[StorageMetrics(device_name="D:", available_capacity_gb=4, total_capacity_gb=500),
                          StorageMetrics(device_name="C:", available_capacity_gb=200, total_capacity_gb=500)])
    assert fires("SYSTEM_DRIVE_SPACE_CRITICAL", c_low)
    assert not fires("SYSTEM_DRIVE_SPACE_WARNING", d_low)


def test_fullest_drive_counts():
    s = snap(storage=[StorageMetrics(device_name="C:", available_capacity_gb=200, total_capacity_gb=500),
                      StorageMetrics(device_name="D:", available_capacity_gb=40, total_capacity_gb=1000)])
    assert fires("DISK_FULL_WARNING", s)  # D: is 96 % full
    assert fires("DISK_FULL_CRITICAL", s)


def test_any_bad_sector_is_a_warning():
    s = snap(storage=[StorageMetrics(device_name="C:", reallocated_sector_count=1, bad_sector_count=0)])
    assert fires("DRIVE_BAD_SECTORS_WARNING", s)
    assert not fires("DRIVE_BAD_SECTORS_CRITICAL", s)


def test_network_is_a_share_of_the_link():
    # 100 Mbps link, 12 MB/s down = 96 %
    s = snap(network=NetworkMetrics(link_speed_mbps=100, receive_bytes_per_s=12_000_000, send_bytes_per_s=0))
    assert fires("NETWORK_SATURATED_INFO", s)
    assert get_rule_by_name("NETWORK_SATURATED_INFO").severity.value == "INFO"


def test_uptime_is_counted_in_days():
    s = snap(cpu=CPUMetrics(uptime_seconds=45 * 24 * 3600))
    assert fires("UPTIME_LONG_INFO", s) and not fires("UPTIME_LONG_WARNING", s)


def test_a_hot_pc_with_a_stopped_case_fan():
    s = snap(cpu=CPUMetrics(core_temperature_c=80), power_vrm=PowerAndVRMMetrics(chassis_fan_speed_rpm=0))
    assert fires("CHASSIS_FAN_STOPPED_CRITICAL", s)
    cool = snap(cpu=CPUMetrics(core_temperature_c=50), power_vrm=PowerAndVRMMetrics(chassis_fan_speed_rpm=0))
    assert not fires("CHASSIS_FAN_STOPPED_CRITICAL", cool)


# --------------------------------------------------------------- security

from datetime import timedelta  # noqa: E402

from app.models.telemetry import SecurityMetrics, SuspiciousProcessInfo, ThreatInfo  # noqa: E402


def sec(**kw):
    base = dict(checked_at=datetime.now(timezone.utc), antivirus="Microsoft Defender", defender_active=True,
                realtime_protection=True, definitions_age_days=0, quick_scan_age_days=1)
    base.update(kw)
    return SecurityMetrics(**base)


def threat(name="Trojan:Win32/Agent", active=False, hours_ago=1):
    return ThreatInfo(name=name, status="detected" if active else "quarantined", active=active,
                      path=r"D:\sysvolume\x.vbs", detected_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago))


def test_a_clean_pc_raises_nothing():
    s = snap(security=sec())
    for name in ("SECURITY_THREAT_ACTIVE_CRITICAL", "SECURITY_THREAT_STOPPED_WARNING", "SECURITY_PROTECTION_OFF_CRITICAL",
                 "SECURITY_DISGUISED_PROGRAM_CRITICAL", "SECURITY_DEFINITIONS_OLD_WARNING", "SECURITY_SCAN_OLD_WARNING"):
        assert not fires(name, s), name


def test_an_active_threat_is_critical_and_named():
    s = snap(security=sec(threats=[threat(active=True), threat("Trojan:BAT/Runner", active=True, hours_ago=2)]))
    assert fires("SECURITY_THREAT_ACTIVE_CRITICAL", s)
    rule = get_rule_by_name("SECURITY_THREAT_ACTIVE_CRITICAL")
    assert rule.message(2, s) == "Malware found: Trojan:Win32/Agent and 1 more"


def test_a_threat_defender_stopped_is_a_warning_for_a_day():
    recent = snap(security=sec(threats=[threat(), threat()]))
    old = snap(security=sec(threats=[threat(hours_ago=30)]))
    assert fires("SECURITY_THREAT_STOPPED_WARNING", recent)
    assert not fires("SECURITY_THREAT_ACTIVE_CRITICAL", recent)
    assert not fires("SECURITY_THREAT_STOPPED_WARNING", old)
    # The same threat caught twice is named once.
    assert get_rule_by_name("SECURITY_THREAT_STOPPED_WARNING").message(2, recent) == \
        "Defender stopped malware: Trojan:Win32/Agent"


def test_protection_off_only_counts_without_another_antivirus():
    assert fires("SECURITY_PROTECTION_OFF_CRITICAL", snap(security=sec(realtime_protection=False)))
    other = sec(realtime_protection=False, defender_active=False, antivirus="Norton 360")
    assert not fires("SECURITY_PROTECTION_OFF_CRITICAL", snap(security=other))
    # Defender's definitions and scans don't matter when another antivirus is in charge.
    assert get_rule_by_name("SECURITY_DEFINITIONS_OLD_WARNING").metric_extractor(snap(security=other)) is None


def test_old_definitions_and_scans():
    s = snap(security=sec(definitions_age_days=4, quick_scan_age_days=20))
    assert fires("SECURITY_DEFINITIONS_OLD_WARNING", s) and not fires("SECURITY_DEFINITIONS_OLD_CRITICAL", s)
    assert fires("SECURITY_SCAN_OLD_WARNING", s) and not fires("SECURITY_SCAN_OLD_CRITICAL", s)


def test_a_disguised_program_is_critical():
    s = snap(security=sec(suspicious_processes=[SuspiciousProcessInfo(
        name="svchost.exe", path=r"C:\Users\HP\AppData\Roaming\svchost.exe", pid=4242)]))
    assert fires("SECURITY_DISGUISED_PROGRAM_CRITICAL", s)
    assert r"svchost.exe running from C:\Users\HP\AppData\Roaming\svchost.exe" in \
        get_rule_by_name("SECURITY_DISGUISED_PROGRAM_CRITICAL").message(1, s)
