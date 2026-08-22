"""
AI Diagnostic Service for Hardware Anomaly Analysis

This module provides AI-powered diagnostic analysis for hardware anomalies,
using LLM integration with a robust rule-based fallback matrix.

Author: Lectio Backend Team
Version: 6.0.0
"""

import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
from beanie import PydanticObjectId

import httpx
from app.core.config import settings
from app.models.alert import AnomalyAlertDocument
from app.models.telemetry import TelemetrySnapshotDocument
from app.services.storage_service import StorageService
from app.schemas.api import DiagnosticReport, ActionableStep, UrgencyLevel

logger = logging.getLogger(__name__)


class AIDiagnosticService:
    """
    Service for generating AI-powered diagnostic reports for hardware anomalies.
    
    This service integrates with LLM APIs (OpenAI) to analyze hardware telemetry
    and generate actionable troubleshooting recommendations. It includes a robust
    rule-based fallback matrix for when LLM APIs are unavailable.
    """
    
    def __init__(self):
        """Initialize the AI diagnostic service."""
        self.openai_api_key = getattr(settings, 'OPENAI_API_KEY', None)
        self.openai_model = getattr(settings, 'OPENAI_MODEL', 'gpt-4')
        self.api_timeout = 30.0  # seconds
        
        logger.info("AIDiagnosticService initialized")
    
    async def generate_diagnostic_report(
        self,
        user_id: str,
        device_id: str,
        alert_id: str
    ) -> DiagnosticReport:
        """
        Generate a diagnostic report for a specific anomaly alert.
        
        This method:
        1. Retrieves the alert and surrounding telemetry context
        2. Attempts LLM-based analysis if API key is available
        3. Falls back to rule-based matrix if LLM fails or is unavailable
        4. Returns a structured diagnostic report with actionable steps
        
        Args:
            user_id: The user's identifier
            device_id: The device's identifier
            alert_id: The alert's identifier to analyze
            
        Returns:
            DiagnosticReport with analysis and recommendations
            
        Raises:
            ValueError: If alert not found or telemetry unavailable
        """
        try:
            # Validate IDs
            try:
                alert_oid = PydanticObjectId(alert_id)
                device_oid = PydanticObjectId(device_id)
            except Exception as e:
                raise ValueError(f"Invalid ID format: {e}")
            
            # Retrieve the alert
            alert = await AnomalyAlertDocument.get(alert_oid)
            if not alert:
                raise ValueError(f"Alert {alert_id} not found")
            
            # Verify tenant isolation
            if str(alert.user_id) != user_id:
                raise ValueError("Alert does not belong to user")
            
            # Retrieve surrounding telemetry context (5-minute window)
            context_start = alert.created_at - timedelta(minutes=5)
            context_end = alert.created_at + timedelta(minutes=1)
            
            telemetry_context = await StorageService.get_historical_telemetry(
                user_id=user_id,
                device_id=device_id,
                start_time=context_start,
                end_time=context_end,
                limit=20
            )
            
            # Attempt LLM-based analysis if API key is available
            if self.openai_api_key:
                try:
                    report = await self._generate_llm_diagnostic(
                        alert=alert,
                        telemetry_context=telemetry_context,
                        device_id=device_id
                    )
                    logger.info(f"LLM diagnostic generated for alert {alert_id}")
                    return report
                except Exception as e:
                    logger.warning(f"LLM diagnostic failed, falling back to rule-based: {e}")
            
            # Fallback to rule-based matrix
            report = await self._generate_rule_based_diagnostic(
                alert=alert,
                telemetry_context=telemetry_context,
                device_id=device_id
            )
            logger.info(f"Rule-based diagnostic generated for alert {alert_id}")
            return report
        
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error generating diagnostic report: {e}")
            raise
    
    async def _generate_llm_diagnostic(
        self,
        alert: AnomalyAlertDocument,
        telemetry_context: List[TelemetrySnapshotDocument],
        device_id: str
    ) -> DiagnosticReport:
        """
        Generate diagnostic report using LLM API.
        
        Args:
            alert: The anomaly alert to analyze
            telemetry_context: Surrounding telemetry snapshots
            device_id: The device identifier
            
        Returns:
            DiagnosticReport with LLM-generated analysis
            
        Raises:
            Exception: If LLM API call fails
        """
        # Prepare telemetry summary
        telemetry_summary = self._prepare_telemetry_summary(telemetry_context)
        
        # Build system prompt
        system_prompt = """You are a senior hardware diagnostics engineer specializing in PC hardware troubleshooting. 
Analyze the provided hardware anomaly data and generate a structured diagnostic report.

Your response must be valid JSON with the following structure:
{
    "root_cause_analysis": "Concise explanation of what failed (e.g., thermal paste degradation, VRM overheating, power supply rail drop)",
    "urgency_level": "IMMEDIATE_ACTION_REQUIRED | ATTENTION_NEEDED | MONITOR",
    "actionable_steps": [
        {
            "step_number": 1,
            "instruction": "Detailed step-by-step instruction",
            "category": "hardware | software | monitoring",
            "estimated_time_minutes": 15
        }
    ],
    "additional_context": {
        "hardware_components_affected": ["CPU", "VRM"],
        "likely_failure_mode": "thermal_throttling",
        "preventive_measures": ["improve_airflow", "replace_thermal_paste"]
    }
}

Be specific and actionable. Focus on the most likely causes based on the alert type and metrics."""
        
        # Build user prompt with alert and telemetry data
        user_prompt = f"""Analyze this hardware anomaly:

Alert Details:
- Rule: {alert.rule_name}
- Severity: {alert.severity.value}
- Metric: {alert.metric_name}
- Trigger Value: {alert.trigger_value}
- Threshold: {alert.threshold_limit}
- Message: {alert.message}

Telemetry Context (5-minute window):
{telemetry_summary}

Device ID: {device_id}

Provide a diagnostic report with root cause analysis, urgency assessment, and step-by-step troubleshooting instructions."""
        
        # Call OpenAI API
        try:
            async with httpx.AsyncClient(timeout=self.api_timeout) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.openai_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.7,
                        "response_format": {"type": "json_object"}
                    }
                )
                
                response.raise_for_status()
                result = response.json()
                
                # Parse LLM response
                llm_content = result["choices"][0]["message"]["content"]
                llm_data = json.loads(llm_content)
                
                # Build diagnostic report
                actionable_steps = [
                    ActionableStep(
                        step_number=step["step_number"],
                        instruction=step["instruction"],
                        category=step["category"],
                        estimated_time_minutes=step.get("estimated_time_minutes")
                    )
                    for step in llm_data.get("actionable_steps", [])
                ]
                
                return DiagnosticReport(
                    alert_id=str(alert.id),
                    device_id=device_id,
                    generated_at=datetime.now(timezone.utc),
                    analysis_method="LLM",
                    root_cause_analysis=llm_data["root_cause_analysis"],
                    urgency_level=llm_data["urgency_level"],
                    actionable_steps=actionable_steps,
                    additional_context=llm_data.get("additional_context")
                )
        
        except httpx.HTTPError as e:
            logger.error(f"OpenAI API HTTP error: {e}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}")
            raise
        except Exception as e:
            logger.error(f"LLM API call failed: {e}")
            raise
    
    async def _generate_rule_based_diagnostic(
        self,
        alert: AnomalyAlertDocument,
        telemetry_context: List[TelemetrySnapshotDocument],
        device_id: str
    ) -> DiagnosticReport:
        """
        Generate diagnostic report using rule-based fallback matrix.
        
        Args:
            alert: The anomaly alert to analyze
            telemetry_context: Surrounding telemetry snapshots
            device_id: The device identifier
            
        Returns:
            DiagnosticReport with rule-based analysis
        """
        # Get rule-based diagnosis from matrix
        diagnosis = self._get_rule_based_diagnosis(alert.rule_name, alert.severity.value)
        
        # Build actionable steps
        actionable_steps = [
            ActionableStep(
                step_number=i + 1,
                instruction=step["instruction"],
                category=step["category"],
                estimated_time_minutes=step.get("estimated_time_minutes")
            )
            for i, step in enumerate(diagnosis["actionable_steps"])
        ]
        
        return DiagnosticReport(
            alert_id=str(alert.id),
            device_id=device_id,
            generated_at=datetime.now(timezone.utc),
            analysis_method="rule_based",
            root_cause_analysis=diagnosis["root_cause_analysis"],
            urgency_level=diagnosis["urgency_level"],
            actionable_steps=actionable_steps,
            additional_context=diagnosis.get("additional_context")
        )
    
    def _prepare_telemetry_summary(self, telemetry_context: List[TelemetrySnapshotDocument]) -> str:
        """
        Prepare a human-readable summary of telemetry context.
        
        Args:
            telemetry_context: List of telemetry snapshots
            
        Returns:
            Formatted string summary
        """
        if not telemetry_context:
            return "No telemetry data available in the context window."
        
        summary_lines = []
        for snapshot in telemetry_context[:5]:  # Limit to 5 snapshots
            if snapshot.telemetry:
                lines = [
                    f"Timestamp: {snapshot.timestamp.isoformat()}",
                    f"CPU: {snapshot.telemetry.cpu.core_temperature_c if snapshot.telemetry.cpu else 'N/A'}°C, "
                    f"{snapshot.telemetry.cpu.utilization_percent if snapshot.telemetry.cpu else 'N/A'}% utilization",
                    f"GPU: {snapshot.telemetry.gpu.core_temperature_c if snapshot.telemetry.gpu else 'N/A'}°C, "
                    f"{snapshot.telemetry.gpu.utilization_percent if snapshot.telemetry.gpu else 'N/A'}% utilization",
                    f"RAM: {snapshot.telemetry.ram.usage_percent if snapshot.telemetry.ram else 'N/A'}% usage",
                ]
                summary_lines.append("\n".join(lines))
        
        return "\n---\n".join(summary_lines)
    
    def _get_rule_based_diagnosis(self, rule_name: str, severity: str) -> Dict[str, Any]:
        """
        Get rule-based diagnosis from the fallback matrix.
        
        Args:
            rule_name: The rule that triggered the alert
            severity: The alert severity level
            
        Returns:
            Dictionary with diagnosis information
        """
        # Rule-based diagnostic matrix
        diagnostic_matrix = {
            "CPU_OVERHEATING_CRITICAL": {
                "root_cause_analysis": "CPU core temperature exceeds critical threshold (90°C). Likely causes: inadequate cooling, thermal paste degradation, dust buildup, or high ambient temperature.",
                "urgency_level": "IMMEDIATE_ACTION_REQUIRED",
                "actionable_steps": [
                    {
                        "instruction": "Immediately check CPU cooler mounting and thermal paste application",
                        "category": "hardware",
                        "estimated_time_minutes": 30
                    },
                    {
                        "instruction": "Clean dust from CPU cooler, heatsink, and case fans",
                        "category": "hardware",
                        "estimated_time_minutes": 20
                    },
                    {
                        "instruction": "Verify case airflow and fan configurations",
                        "category": "hardware",
                        "estimated_time_minutes": 15
                    },
                    {
                        "instruction": "Monitor CPU usage for background processes causing high load",
                        "category": "software",
                        "estimated_time_minutes": 10
                    },
                    {
                        "instruction": "Consider upgrading CPU cooler if temperatures persist",
                        "category": "hardware",
                        "estimated_time_minutes": 60
                    }
                ],
                "additional_context": {
                    "hardware_components_affected": ["CPU", "CPU_Cooler"],
                    "likely_failure_mode": "thermal_throttling",
                    "preventive_measures": ["regular_dust_cleaning", "thermal_paste_reapplication"]
                }
            },
            "GPU_OVERHEATING_CRITICAL": {
                "root_cause_analysis": "GPU core temperature exceeds critical threshold (95°C). Likely causes: inadequate GPU cooling, thermal pad degradation, poor case airflow, or high GPU load.",
                "urgency_level": "IMMEDIATE_ACTION_REQUIRED",
                "actionable_steps": [
                    {
                        "instruction": "Check GPU fan operation and fan curve settings",
                        "category": "hardware",
                        "estimated_time_minutes": 10
                    },
                    {
                        "instruction": "Clean dust from GPU heatsink and fans",
                        "category": "hardware",
                        "estimated_time_minutes": 20
                    },
                    {
                        "instruction": "Improve case airflow with additional intake/exhaust fans",
                        "category": "hardware",
                        "estimated_time_minutes": 30
                    },
                    {
                        "instruction": "Check for GPU overclocking and revert to stock settings",
                        "category": "software",
                        "estimated_time_minutes": 5
                    },
                    {
                        "instruction": "Monitor GPU usage for demanding applications",
                        "category": "software",
                        "estimated_time_minutes": 10
                    }
                ],
                "additional_context": {
                    "hardware_components_affected": ["GPU", "GPU_Cooler"],
                    "likely_failure_mode": "thermal_throttling",
                    "preventive_measures": ["regular_dust_cleaning", "fan_curve_optimization"]
                }
            },
            "PSU_VOLTAGE_CRITICAL": {
                "root_cause_analysis": "PSU voltage rail exceeds safe tolerance (±5%). Likely causes: failing power supply, voltage regulator issues, or excessive load on specific rail.",
                "urgency_level": "IMMEDIATE_ACTION_REQUIRED",
                "actionable_steps": [
                    {
                        "instruction": "Immediately reduce system load and shut down if voltage is critically low",
                        "category": "hardware",
                        "estimated_time_minutes": 5
                    },
                    {
                        "instruction": "Test with a known-good power supply if available",
                        "category": "hardware",
                        "estimated_time_minutes": 30
                    },
                    {
                        "instruction": "Check for loose power cables and connections",
                        "category": "hardware",
                        "estimated_time_minutes": 10
                    },
                    {
                        "instruction": "Disconnect non-essential components to reduce load",
                        "category": "hardware",
                        "estimated_time_minutes": 15
                    },
                    {
                        "instruction": "Replace power supply if voltage issues persist",
                        "category": "hardware",
                        "estimated_time_minutes": 60
                    }
                ],
                "additional_context": {
                    "hardware_components_affected": ["PSU", "Motherboard"],
                    "likely_failure_mode": "power_instability",
                    "preventive_measures": ["psu_quality_upgrade", "cable_management"]
                }
            },
            "NVME_HEALTH_CRITICAL": {
                "root_cause_analysis": "NVMe SSD health percentage is critically low (<10%). Likely causes: drive wear, write endurance exceeded, or impending failure.",
                "urgency_level": "IMMEDIATE_ACTION_REQUIRED",
                "actionable_steps": [
                    {
                        "instruction": "Immediately backup all critical data from the drive",
                        "category": "software",
                        "estimated_time_minutes": 60
                    },
                    {
                        "instruction": "Check SMART attributes for specific failure indicators",
                        "category": "software",
                        "estimated_time_minutes": 10
                    },
                    {
                        "instruction": "Replace the NVMe drive with a new one",
                        "category": "hardware",
                        "estimated_time_minutes": 45
                    },
                    {
                        "instruction": "Verify drive warranty status for potential replacement",
                        "category": "administrative",
                        "estimated_time_minutes": 15
                    }
                ],
                "additional_context": {
                    "hardware_components_affected": ["NVMe_SSD"],
                    "likely_failure_mode": "storage_failure",
                    "preventive_measures": ["regular_backups", "health_monitoring"]
                }
            },
            "VRM_TEMPERATURE_CRITICAL": {
                "root_cause_analysis": "VRM temperature exceeds critical threshold (100°C). Likely causes: inadequate motherboard cooling, high CPU overclock, or poor case airflow.",
                "urgency_level": "IMMEDIATE_ACTION_REQUIRED",
                "actionable_steps": [
                    {
                        "instruction": "Reduce CPU overclock or revert to stock settings",
                        "category": "software",
                        "estimated_time_minutes": 5
                    },
                    {
                        "instruction": "Improve airflow around motherboard VRM area",
                        "category": "hardware",
                        "estimated_time_minutes": 20
                    },
                    {
                        "instruction": "Check for motherboard VRM heatsink contact",
                        "category": "hardware",
                        "estimated_time_minutes": 30
                    },
                    {
                        "instruction": "Consider adding dedicated VRM cooling fan",
                        "category": "hardware",
                        "estimated_time_minutes": 15
                    }
                ],
                "additional_context": {
                    "hardware_components_affected": ["Motherboard_VRM", "CPU"],
                    "likely_failure_mode": "thermal_throttling",
                    "preventive_measures": ["airflow_optimization", "conservative_overclocking"]
                }
            },
            "WHEA_ERRORS_CRITICAL": {
                "root_cause_analysis": "Windows Hardware Error Architecture (WHEA) errors indicate hardware instability. Likely causes: memory errors, CPU instability, or motherboard issues.",
                "urgency_level": "IMMEDIATE_ACTION_REQUIRED",
                "actionable_steps": [
                    {
                        "instruction": "Run Windows Memory Diagnostic to check for RAM issues",
                        "category": "software",
                        "estimated_time_minutes": 30
                    },
                    {
                        "instruction": "Check CPU temperatures and reduce overclock if present",
                        "category": "hardware",
                        "estimated_time_minutes": 10
                    },
                    {
                        "instruction": "Update BIOS/UEFI firmware to latest version",
                        "category": "software",
                        "estimated_time_minutes": 20
                    },
                    {
                        "instruction": "Reseat RAM modules and check for proper seating",
                        "category": "hardware",
                        "estimated_time_minutes": 15
                    },
                    {
                        "instruction": "Check Event Viewer for specific WHEA error details",
                        "category": "software",
                        "estimated_time_minutes": 10
                    }
                ],
                "additional_context": {
                    "hardware_components_affected": ["RAM", "CPU", "Motherboard"],
                    "likely_failure_mode": "hardware_instability",
                    "preventive_measures": ["firmware_updates", "stability_testing"]
                }
            }
        }
        
        # Default diagnosis for unknown rules
        default_diagnosis = {
            "root_cause_analysis": f"Hardware anomaly detected for rule '{rule_name}'. Review the specific metric and threshold values to determine the appropriate troubleshooting steps.",
            "urgency_level": "ATTENTION_NEEDED" if severity == "WARNING" else "IMMEDIATE_ACTION_REQUIRED",
            "actionable_steps": [
                {
                    "instruction": "Review the specific metric that triggered the alert",
                    "category": "monitoring",
                    "estimated_time_minutes": 10
                },
                {
                    "instruction": "Check historical data for patterns or trends",
                    "category": "monitoring",
                    "estimated_time_minutes": 15
                },
                {
                    "instruction": "Consult hardware documentation for the affected component",
                    "category": "documentation",
                    "estimated_time_minutes": 20
                }
            ],
            "additional_context": {
                "hardware_components_affected": ["unknown"],
                "likely_failure_mode": "anomaly_detected",
                "preventive_measures": ["monitoring"]
            }
        }
        
        return diagnostic_matrix.get(rule_name, default_diagnosis)


# Global service instance
ai_diagnostic_service = AIDiagnosticService()
