"""
AI Diagnostics & Fallback Matrix Tests

This module tests the AI Diagnostic Service, including successful LLM API calls,
fallback mechanisms for timeouts and missing API keys, and rule-based diagnostic matrix.

Author: Lectio Backend Team
Version: 7.0.0
"""

import pytest
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ai_diagnostic_service import AIDiagnosticService, check_openai_connection
from app.schemas.api import DiagnosticReport, ActionableStep, UrgencyLevel
from app.models.alert import AlertSeverity
from openai import APIConnectionError, APIError, RateLimitError


class TestAIDiagnosticServiceInitialization:
    """Test suite for AI Diagnostic Service initialization."""
    
    @pytest.mark.asyncio
    async def test_initialization_with_api_key(self):
        """Test service initialization with valid API key."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            assert service.openai_api_key == "test_api_key"
            assert service.openai_model == "gpt-4o-mini"
            assert service.api_timeout == 5.0
            assert service.client is not None
    
    @pytest.mark.asyncio
    async def test_initialization_without_api_key(self):
        """Test service initialization without API key (fallback mode)."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            assert service.openai_api_key == ""
            assert service.client is None
    
    @pytest.mark.asyncio
    async def test_initialization_with_none_api_key(self):
        """Test service initialization with None API key."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = None
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            assert service.openai_api_key is None
            assert service.client is None


class TestLLMDiagnosticGeneration:
    """Test suite for LLM-based diagnostic report generation."""
    
    @pytest.mark.asyncio
    async def test_successful_llm_diagnostic(self, test_alert, test_device, synthetic_telemetry_snapshot, mock_openai_client):
        """Test successful diagnostic report generation using LLM."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert isinstance(report, DiagnosticReport)
            assert report.alert_id == str(test_alert.id)
            assert report.device_id == str(test_device.id)
            assert report.analysis_method == "LLM"
            assert report.root_cause_analysis is not None
            assert report.urgency_level is not None
            assert len(report.actionable_steps) > 0
            assert report.generated_at is not None
    
    @pytest.mark.asyncio
    async def test_llm_diagnostic_structure(self, test_alert, test_device, mock_openai_client):
        """Test that LLM diagnostic reports have correct structure."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Verify structure
            assert hasattr(report, 'root_cause_analysis')
            assert hasattr(report, 'urgency_level')
            assert hasattr(report, 'actionable_steps')
            assert hasattr(report, 'additional_context')
            
            # Verify actionable steps structure
            for step in report.actionable_steps:
                assert hasattr(step, 'step_number')
                assert hasattr(step, 'instruction')
                assert hasattr(step, 'category')
                assert hasattr(step, 'estimated_time_minutes')
    
    @pytest.mark.asyncio
    async def test_llm_diagnostic_content_validation(self, test_alert, test_device, mock_openai_client):
        """Test that LLM diagnostic content is valid and meaningful."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Validate content
            assert len(report.root_cause_analysis) > 10
            assert report.urgency_level in ["IMMEDIATE_ACTION_REQUIRED", "ATTENTION_NEEDED", "MONITOR"]
            assert len(report.actionable_steps) >= 1
            
            # Validate step content
            for step in report.actionable_steps:
                assert len(step.instruction) > 5
                assert step.category in ["hardware", "software", "monitoring", "administrative"]
                assert step.estimated_time_minutes > 0
    
    @pytest.mark.asyncio
    async def test_llm_diagnostic_with_telemetry_context(self, test_alert, test_device, synthetic_telemetry_snapshot, mock_openai_client):
        """Test that telemetry context is included in LLM diagnostics."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # The report should be generated with telemetry context
            assert report is not None
            assert report.analysis_method == "LLM"


class TestFallbackMechanism:
    """Test suite for fallback mechanism when LLM is unavailable."""
    
    @pytest.mark.asyncio
    async def test_fallback_on_timeout(self, test_alert, test_device, mock_openai_timeout):
        """Test fallback to rule-based diagnostics on API timeout."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Should fall back to rule-based
            assert isinstance(report, DiagnosticReport)
            assert report.analysis_method == "rule_based"
            assert report.root_cause_analysis is not None
            assert len(report.actionable_steps) > 0
    
    @pytest.mark.asyncio
    async def test_fallback_on_missing_api_key(self, test_alert, test_device):
        """Test fallback when API key is not configured."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Should use rule-based directly
            assert isinstance(report, DiagnosticReport)
            assert report.analysis_method == "rule_based"
            assert report.root_cause_analysis is not None
    
    @pytest.mark.asyncio
    async def test_fallback_on_api_error(self, test_alert, test_device):
        """Test fallback on API error."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings, \
             patch('openai.AsyncOpenAI') as mock_client_class:
            
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("API Error")
            )
            mock_client_class.return_value = mock_client
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Should fall back to rule-based
            assert isinstance(report, DiagnosticReport)
            assert report.analysis_method == "rule_based"
    
    @pytest.mark.asyncio
    async def test_fallback_on_rate_limit(self, test_alert, test_device):
        """Test fallback on rate limit error."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings, \
             patch('openai.AsyncOpenAI') as mock_client_class:
            
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("Rate limit exceeded")
            )
            mock_client_class.return_value = mock_client
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Should fall back to rule-based
            assert isinstance(report, DiagnosticReport)
            assert report.analysis_method == "rule_based"
    
    @pytest.mark.asyncio
    async def test_fallback_no_unhandled_errors(self, test_alert, test_device):
        """Test that fallback doesn't raise unhandled errors."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings, \
             patch('openai.AsyncOpenAI') as mock_client_class:
            
            mock_settings.OPENAI_API_KEY = "test_api_key"
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("Unexpected error")
            )
            mock_client_class.return_value = mock_client
            
            service = AIDiagnosticService()
            
            # Should not raise unhandled error
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Should fall back to rule-based
            assert isinstance(report, DiagnosticReport)
            assert report.analysis_method == "rule_based"


class TestRuleBasedDiagnosticMatrix:
    """Test suite for rule-based diagnostic matrix."""
    
    @pytest.mark.asyncio
    async def test_cpu_overheating_diagnosis(self, test_alert, test_device):
        """Test CPU overheating rule-based diagnosis."""
        test_alert.rule_name = "CPU_OVERHEATING_CRITICAL"
        test_alert.severity = AlertSeverity.CRITICAL
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.analysis_method == "rule_based"
            assert "CPU" in report.root_cause_analysis or "thermal" in report.root_cause_analysis.lower()
            assert report.urgency_level == "IMMEDIATE_ACTION_REQUIRED"
            assert len(report.actionable_steps) >= 3
    
    @pytest.mark.asyncio
    async def test_gpu_overheating_diagnosis(self, test_alert, test_device):
        """Test GPU overheating rule-based diagnosis."""
        test_alert.rule_name = "GPU_OVERHEATING_CRITICAL"
        test_alert.severity = AlertSeverity.CRITICAL
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.analysis_method == "rule_based"
            assert "GPU" in report.root_cause_analysis or "thermal" in report.root_cause_analysis.lower()
            assert report.urgency_level == "IMMEDIATE_ACTION_REQUIRED"
    
    @pytest.mark.asyncio
    async def test_psu_voltage_diagnosis(self, test_alert, test_device):
        """Test PSU voltage rule-based diagnosis."""
        test_alert.rule_name = "PSU_VOLTAGE_CRITICAL"
        test_alert.severity = AlertSeverity.CRITICAL
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.analysis_method == "rule_based"
            assert "PSU" in report.root_cause_analysis or "voltage" in report.root_cause_analysis.lower()
            assert report.urgency_level == "IMMEDIATE_ACTION_REQUIRED"
    
    @pytest.mark.asyncio
    async def test_nvme_health_diagnosis(self, test_alert, test_device):
        """Test NVMe health rule-based diagnosis."""
        test_alert.rule_name = "NVME_HEALTH_CRITICAL"
        test_alert.severity = AlertSeverity.CRITICAL
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.analysis_method == "rule_based"
            assert "NVMe" in report.root_cause_analysis or "storage" in report.root_cause_analysis.lower()
            assert report.urgency_level == "IMMEDIATE_ACTION_REQUIRED"
    
    @pytest.mark.asyncio
    async def test_vrm_temperature_diagnosis(self, test_alert, test_device):
        """Test VRM temperature rule-based diagnosis."""
        test_alert.rule_name = "VRM_TEMPERATURE_CRITICAL"
        test_alert.severity = AlertSeverity.CRITICAL
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.analysis_method == "rule_based"
            assert "VRM" in report.root_cause_analysis or "motherboard" in report.root_cause_analysis.lower()
            assert report.urgency_level == "IMMEDIATE_ACTION_REQUIRED"
    
    @pytest.mark.asyncio
    async def test_whea_errors_diagnosis(self, test_alert, test_device):
        """Test WHEA errors rule-based diagnosis."""
        test_alert.rule_name = "WHEA_ERRORS_CRITICAL"
        test_alert.severity = AlertSeverity.CRITICAL
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.analysis_method == "rule_based"
            assert "WHEA" in report.root_cause_analysis or "hardware" in report.root_cause_analysis.lower()
            assert report.urgency_level == "IMMEDIATE_ACTION_REQUIRED"
    
    @pytest.mark.asyncio
    async def test_unknown_rule_diagnosis(self, test_alert, test_device):
        """Test rule-based diagnosis for unknown rule."""
        test_alert.rule_name = "UNKNOWN_RULE"
        test_alert.severity = AlertSeverity.WARNING
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.analysis_method == "rule_based"
            assert "UNKNOWN_RULE" in report.root_cause_analysis
            assert report.urgency_level == "ATTENTION_NEEDED"
    
    @pytest.mark.asyncio
    async def test_actionable_steps_structure(self, test_alert, test_device):
        """Test that actionable steps have correct structure."""
        test_alert.rule_name = "CPU_OVERHEATING_CRITICAL"
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Verify step numbering
            for i, step in enumerate(report.actionable_steps):
                assert step.step_number == i + 1
            
            # Verify categories are valid
            valid_categories = ["hardware", "software", "monitoring", "administrative"]
            for step in report.actionable_steps:
                assert step.category in valid_categories
    
    @pytest.mark.asyncio
    async def test_additional_context_structure(self, test_alert, test_device):
        """Test that additional context has correct structure."""
        test_alert.rule_name = "CPU_OVERHEATING_CRITICAL"
        
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.additional_context is not None
            assert "hardware_components_affected" in report.additional_context
            assert "likely_failure_mode" in report.additional_context
            assert "preventive_measures" in report.additional_context


class TestOpenAIConnectionCheck:
    """Test suite for OpenAI connection check function."""
    
    @pytest.mark.asyncio
    async def test_connection_check_success(self):
        """Test successful connection check."""
        with patch('app.services.ai_diagnostic_service.ai_diagnostic_service') as mock_service, \
             patch('openai.AsyncOpenAI') as mock_client_class:
            
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_choice = MagicMock()
            mock_message = MagicMock()
            mock_message.content = "pong"
            mock_choice.message = mock_message
            mock_response.choices = [mock_choice]
            mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client
            
            mock_service.client = mock_client
            mock_service.openai_model = "gpt-4o-mini"
            mock_service.api_timeout = 5.0
            
            result = await check_openai_connection()
            
            assert result == True
    
    @pytest.mark.asyncio
    async def test_connection_check_no_client(self):
        """Test connection check when client is not initialized."""
        with patch('app.services.ai_diagnostic_service.ai_diagnostic_service') as mock_service:
            mock_service.client = None
            
            result = await check_openai_connection()
            
            assert result == False
    
    @pytest.mark.asyncio
    async def test_connection_check_timeout(self):
        """Test connection check on timeout."""
        with patch('app.services.ai_diagnostic_service.ai_diagnostic_service') as mock_service, \
             patch('openai.AsyncOpenAI') as mock_client_class:
            
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("Connection timeout")
            )
            mock_client_class.return_value = mock_client
            
            mock_service.client = mock_client
            mock_service.openai_model = "gpt-4o-mini"
            mock_service.api_timeout = 5.0
            
            result = await check_openai_connection()
            
            assert result == False
    
    @pytest.mark.asyncio
    async def test_connection_check_rate_limit(self):
        """Test connection check on rate limit."""
        with patch('app.services.ai_diagnostic_service.ai_diagnostic_service') as mock_service, \
             patch('openai.AsyncOpenAI') as mock_client_class:
            
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("Rate limit exceeded")
            )
            mock_client_class.return_value = mock_client
            
            mock_service.client = mock_client
            mock_service.openai_model = "gpt-4o-mini"
            mock_service.api_timeout = 5.0
            
            result = await check_openai_connection()
            
            assert result == False
    
    @pytest.mark.asyncio
    async def test_connection_check_api_error(self):
        """Test connection check on API error."""
        with patch('app.services.ai_diagnostic_service.ai_diagnostic_service') as mock_service, \
             patch('openai.AsyncOpenAI') as mock_client_class:
            
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("API Error")
            )
            mock_client_class.return_value = mock_client
            
            mock_service.client = mock_client
            mock_service.openai_model = "gpt-4o-mini"
            mock_service.api_timeout = 5.0
            
            result = await check_openai_connection()
            
            assert result == False


class TestDiagnosticReportValidation:
    """Test suite for diagnostic report validation."""
    
    @pytest.mark.asyncio
    async def test_report_timestamp_is_current(self, test_alert, test_device):
        """Test that report timestamp is current."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            # Timestamp should be within last minute
            time_diff = (datetime.now(timezone.utc) - report.generated_at).total_seconds()
            assert time_diff < 60
    
    @pytest.mark.asyncio
    async def test_report_ids_match_request(self, test_alert, test_device):
        """Test that report IDs match the request."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            assert report.alert_id == str(test_alert.id)
            assert report.device_id == str(test_device.id)
    
    @pytest.mark.asyncio
    async def test_report_urgency_levels_valid(self, test_alert, test_device):
        """Test that urgency levels are valid."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            report = await service.generate_diagnostic_report(
                user_id=str(test_device.user_id),
                device_id=str(test_device.id),
                alert_id=str(test_alert.id)
            )
            
            valid_urgency_levels = ["IMMEDIATE_ACTION_REQUIRED", "ATTENTION_NEEDED", "MONITOR"]
            assert report.urgency_level in valid_urgency_levels


class TestDiagnosticErrorHandling:
    """Test suite for diagnostic error handling."""
    
    @pytest.mark.asyncio
    async def test_invalid_alert_id(self, test_device):
        """Test handling of invalid alert ID."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            with pytest.raises(ValueError):
                await service.generate_diagnostic_report(
                    user_id=str(test_device.user_id),
                    device_id=str(test_device.id),
                    alert_id="invalid_id"
                )
    
    @pytest.mark.asyncio
    async def test_nonexistent_alert(self, test_device):
        """Test handling of nonexistent alert."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            with pytest.raises(ValueError):
                await service.generate_diagnostic_report(
                    user_id=str(test_device.user_id),
                    device_id=str(test_device.id),
                    alert_id="507f1f77bcf86cd799439011"  # Valid ObjectId format but doesn't exist
                )
    
    @pytest.mark.asyncio
    async def test_tenant_isolation_enforcement(self, test_alert, other_user):
        """Test that tenant isolation is enforced."""
        with patch('app.services.ai_diagnostic_service.settings') as mock_settings:
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.OPENAI_MODEL = "gpt-4o-mini"
            mock_settings.OPENAI_TIMEOUT_SECONDS = 5.0
            
            service = AIDiagnosticService()
            
            with pytest.raises(ValueError):
                await service.generate_diagnostic_report(
                    user_id=str(other_user.id),
                    device_id=str(test_alert.device_id),
                    alert_id=str(test_alert.id)
                )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
