"""
Anomaly Detection Rules Configuration

This module defines the baseline threshold rules for anomaly detection
across various hardware metrics. Rules include CPU/GPU thermal limits,
voltage rail tolerances, storage health thresholds, and WHEA error monitoring.

Author: Lectio Backend Team
Version: 4.0.0
"""

from dataclasses import dataclass
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
        resolution_duration: Minimum duration (seconds) before auto-resolution
        message_template: Template for alert message
        metric_extractor: Function to extract metric value from TelemetrySnapshot
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


# Metric extractor functions
def extract_cpu_core_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract CPU core temperature."""
    return snapshot.cpu.core_temperature_c


def extract_cpu_package_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract CPU package temperature."""
    return snapshot.cpu.package_temperature_c


def extract_gpu_core_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract GPU core temperature."""
    return snapshot.gpu.core_temperature_c


def extract_gpu_hotspot_temp(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract GPU hotspot temperature."""
    return snapshot.gpu.hotspot_temperature_c


def extract_psu_12v_voltage(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract PSU +12V voltage."""
    return snapshot.power_vrm.psu_12v_voltage


def extract_nvme_health_percent(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract NVMe S.M.A.R.T. health percentage (minimum across all drives)."""
    if not snapshot.storage:
        return None
    health_values = [s.smart_health_percent for s in snapshot.storage if s.smart_health_percent is not None]
    return min(health_values) if health_values else None


def extract_whea_error_count(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract WHEA error count."""
    return float(snapshot.ram.whea_error_count)


def extract_vrm_temperature(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract VRM temperature."""
    return snapshot.power_vrm.vrm_temperature_c


def extract_cpu_utilization(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract CPU utilization percentage."""
    return snapshot.cpu.utilization_percent


def extract_gpu_utilization(snapshot: TelemetrySnapshot) -> Optional[float]:
    """Extract GPU utilization percentage."""
    return snapshot.gpu.utilization_percent


# Baseline anomaly detection rules
BASELINE_RULES = [
    # CPU Thermal Rules
    AnomalyRule(
        name="CPU_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="cpu_core_temperature_c",
        threshold=90.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=30.0,  # 30 seconds
        resolution_duration=15.0,  # 15 seconds
        message_template="CPU core temperature critical: {value:.1f}°C exceeds threshold {threshold:.1f}°C",
        metric_extractor=extract_cpu_core_temp
    ),
    AnomalyRule(
        name="CPU_OVERHEATING_WARNING",
        severity=AlertSeverity.WARNING,
        metric_name="cpu_core_temperature_c",
        threshold=80.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=30.0,  # 30 seconds
        resolution_duration=15.0,  # 15 seconds
        message_template="CPU core temperature elevated: {value:.1f}°C exceeds threshold {threshold:.1f}°C",
        metric_extractor=extract_cpu_core_temp
    ),
    AnomalyRule(
        name="CPU_PACKAGE_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="cpu_package_temperature_c",
        threshold=95.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=30.0,  # 30 seconds
        resolution_duration=15.0,  # 15 seconds
        message_template="CPU package temperature critical: {value:.1f}°C exceeds threshold {threshold:.1f}°C",
        metric_extractor=extract_cpu_package_temp
    ),
    
    # GPU Thermal Rules
    AnomalyRule(
        name="GPU_HOTSPOT_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="gpu_hotspot_temperature_c",
        threshold=95.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=15.0,  # 15 seconds
        resolution_duration=15.0,  # 15 seconds
        message_template="GPU hotspot temperature critical: {value:.1f}°C exceeds threshold {threshold:.1f}°C",
        metric_extractor=extract_gpu_hotspot_temp
    ),
    AnomalyRule(
        name="GPU_CORE_OVERHEATING_WARNING",
        severity=AlertSeverity.WARNING,
        metric_name="gpu_core_temperature_c",
        threshold=85.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=30.0,  # 30 seconds
        resolution_duration=15.0,  # 15 seconds
        message_template="GPU core temperature elevated: {value:.1f}°C exceeds threshold {threshold:.1f}°C",
        metric_extractor=extract_gpu_core_temp
    ),
    
    # PSU Voltage Rules
    AnomalyRule(
        name="PSU_12V_UNDERVOLTAGE_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="psu_12v_voltage",
        threshold=11.4,
        operator=ComparisonOperator.LESS_THAN,
        duration_threshold=5.0,  # 5 seconds (voltage issues are critical)
        resolution_duration=10.0,  # 10 seconds
        message_template="PSU +12V rail undervoltage critical: {value:.2f}V below threshold {threshold:.2f}V",
        metric_extractor=extract_psu_12v_voltage
    ),
    AnomalyRule(
        name="PSU_12V_OVERVOLTAGE_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="psu_12v_voltage",
        threshold=12.6,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=5.0,  # 5 seconds (voltage issues are critical)
        resolution_duration=10.0,  # 10 seconds
        message_template="PSU +12V rail overvoltage critical: {value:.2f}V exceeds threshold {threshold:.2f}V",
        metric_extractor=extract_psu_12v_voltage
    ),
    
    # Storage Health Rules
    AnomalyRule(
        name="NVME_HEALTH_LOW_WARNING",
        severity=AlertSeverity.WARNING,
        metric_name="nvme_smart_health_percent",
        threshold=20.0,
        operator=ComparisonOperator.LESS_THAN,
        duration_threshold=60.0,  # 60 seconds (health changes slowly)
        resolution_duration=300.0,  # 5 minutes (health recovery is slow)
        message_template="NVMe S.M.A.R.T. health low: {value:.1f}% below threshold {threshold:.1f}%",
        metric_extractor=extract_nvme_health_percent
    ),
    AnomalyRule(
        name="NVME_HEALTH_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="nvme_smart_health_percent",
        threshold=10.0,
        operator=ComparisonOperator.LESS_THAN,
        duration_threshold=60.0,  # 60 seconds
        resolution_duration=300.0,  # 5 minutes
        message_template="NVMe S.M.A.R.T. health critical: {value:.1f}% below threshold {threshold:.1f}%",
        metric_extractor=extract_nvme_health_percent
    ),
    
    # WHEA Error Rules
    AnomalyRule(
        name="WHEA_ERROR_SPIKE_WARNING",
        severity=AlertSeverity.WARNING,
        metric_name="whea_error_count",
        threshold=1.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=60.0,  # 60 seconds window
        resolution_duration=300.0,  # 5 minutes (errors take time to clear)
        message_template="WHEA hardware errors detected: {value:.0f} errors in monitoring window",
        metric_extractor=extract_whea_error_count
    ),
    
    # VRM Thermal Rules
    AnomalyRule(
        name="VRM_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="vrm_temperature_c",
        threshold=100.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=30.0,  # 30 seconds
        resolution_duration=15.0,  # 15 seconds
        message_template="VRM temperature critical: {value:.1f}°C exceeds threshold {threshold:.1f}°C",
        metric_extractor=extract_vrm_temperature
    ),
    AnomalyRule(
        name="VRM_OVERHEATING_WARNING",
        severity=AlertSeverity.WARNING,
        metric_name="vrm_temperature_c",
        threshold=85.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=30.0,  # 30 seconds
        resolution_duration=15.0,  # 15 seconds
        message_template="VRM temperature elevated: {value:.1f}°C exceeds threshold {threshold:.1f}°C",
        metric_extractor=extract_vrm_temperature
    ),
    
    # High Utilization Rules (Info level)
    AnomalyRule(
        name="CPU_HIGH_UTILIZATION_INFO",
        severity=AlertSeverity.INFO,
        metric_name="cpu_utilization_percent",
        threshold=90.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=60.0,  # 60 seconds
        resolution_duration=30.0,  # 30 seconds
        message_template="CPU utilization high: {value:.1f}% exceeds threshold {threshold:.1f}%",
        metric_extractor=extract_cpu_utilization
    ),
    AnomalyRule(
        name="GPU_HIGH_UTILIZATION_INFO",
        severity=AlertSeverity.INFO,
        metric_name="gpu_utilization_percent",
        threshold=90.0,
        operator=ComparisonOperator.GREATER_THAN,
        duration_threshold=60.0,  # 60 seconds
        resolution_duration=30.0,  # 30 seconds
        message_template="GPU utilization high: {value:.1f}% exceeds threshold {threshold:.1f}%",
        metric_extractor=extract_gpu_utilization
    ),
]


def get_rule_by_name(rule_name: str) -> Optional[AnomalyRule]:
    """
    Retrieve a rule by its name.
    
    Args:
        rule_name: The name of the rule to retrieve
        
    Returns:
        The AnomalyRule if found, None otherwise
    """
    for rule in BASELINE_RULES:
        if rule.name == rule_name:
            return rule
    return None


def evaluate_rule(rule: AnomalyRule, value: float) -> bool:
    """
    Evaluate if a value breaches the rule threshold.
    
    Args:
        rule: The anomaly rule to evaluate
        value: The metric value to check
        
    Returns:
        True if the threshold is breached, False otherwise
    """
    if rule.operator == ComparisonOperator.GREATER_THAN:
        return value > rule.threshold
    elif rule.operator == ComparisonOperator.LESS_THAN:
        return value < rule.threshold
    elif rule.operator == ComparisonOperator.GREATER_THAN_OR_EQUAL:
        return value >= rule.threshold
    elif rule.operator == ComparisonOperator.LESS_THAN_OR_EQUAL:
        return value <= rule.threshold
    return False
