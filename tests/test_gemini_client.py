"""Both AI features talk to Google Gemini, through its OpenAI-compatible endpoint."""

from unittest.mock import patch

from app.core.config import settings

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def test_default_settings_point_at_gemini():
    assert settings.GEMINI_BASE_URL == GEMINI_URL
    assert settings.GEMINI_MODEL.startswith("gemini")


def test_diagnosis_client_uses_the_gemini_key_and_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini-key")
    from app.services.ai_diagnostic_service import AIDiagnosticService

    with patch("app.services.ai_diagnostic_service.AsyncOpenAI") as client_class:
        service = AIDiagnosticService()

    kwargs = client_class.call_args.kwargs
    assert kwargs["api_key"] == "test-gemini-key"
    assert kwargs["base_url"] == GEMINI_URL
    assert service.model == settings.GEMINI_MODEL


def test_fix_advice_client_uses_the_gemini_key_and_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini-key")
    from app.services.fix_advisor import FixAdvisor

    with patch("app.services.fix_advisor.AsyncOpenAI") as client_class:
        FixAdvisor()

    kwargs = client_class.call_args.kwargs
    assert kwargs["api_key"] == "test-gemini-key"
    assert kwargs["base_url"] == GEMINI_URL


def test_no_key_means_no_ai_client(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    from app.services.ai_diagnostic_service import AIDiagnosticService
    from app.services.fix_advisor import FixAdvisor

    assert AIDiagnosticService().client is None
    assert FixAdvisor().client is None
