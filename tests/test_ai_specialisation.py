"""
The diagnosis AI is kept to Lectio's job: telemetry alerts in, a checked report out.
"""

import pytest

from app.core.anomaly_rules import BASELINE_RULES
from app.models.alert import AlertSeverity
from app.services.ai_diagnostic_service import (
    MAX_STEPS,
    SYSTEM_PROMPT,
    AIDiagnosticService,
    validate_llm_reply,
)


def _reply(**overrides):
    reply = {
        "root_cause_analysis": "The processor is hot because it is fully busy.",
        "urgency_level": "ATTENTION_NEEDED",
        "actionable_steps": [
            {"step_number": 1, "instruction": "Close the busy app.", "category": "software", "estimated_time_minutes": 2},
        ],
        "additional_context": {
            "hardware_components_affected": ["CPU"],
            "likely_failure_mode": "sustained_high_load",
            "preventive_measures": ["regular_dust_cleaning"],
        },
    }
    reply.update(overrides)
    return reply


class TestReplyCheck:
    def test_good_reply_passes(self):
        out = validate_llm_reply(_reply(), "WARNING")
        assert out["urgency_level"] == "ATTENTION_NEEDED"
        assert out["actionable_steps"][0].instruction == "Close the busy app."

    @pytest.mark.parametrize("bad", [
        "not a dict",
        _reply(root_cause_analysis=""),
        _reply(root_cause_analysis=None),
        _reply(urgency_level="PANIC"),
        _reply(actionable_steps=[]),
        _reply(actionable_steps="do things"),
        _reply(actionable_steps=[{"instruction": "Buy crypto", "category": "investing"}]),
    ])
    def test_untrustworthy_reply_is_rejected(self, bad):
        with pytest.raises(ValueError):
            validate_llm_reply(bad, "WARNING")

    def test_urgency_never_below_the_alert_severity(self):
        out = validate_llm_reply(_reply(urgency_level="MONITOR"), "CRITICAL")
        assert out["urgency_level"] == "IMMEDIATE_ACTION_REQUIRED"

    def test_urgency_may_be_raised(self):
        out = validate_llm_reply(_reply(urgency_level="IMMEDIATE_ACTION_REQUIRED"), "INFO")
        assert out["urgency_level"] == "IMMEDIATE_ACTION_REQUIRED"

    def test_bad_steps_dropped_and_renumbered(self):
        steps = [
            {"step_number": 7, "instruction": "Ignore", "category": "cooking"},
            {"step_number": 9, "instruction": "Clean the fans.", "category": "hardware", "estimated_time_minutes": 20},
            {"step_number": 3, "instruction": "  ", "category": "software"},
            {"step_number": 4, "instruction": "Watch it.", "category": "monitoring", "estimated_time_minutes": -5},
        ]
        out = validate_llm_reply(_reply(actionable_steps=steps), "WARNING")
        got = out["actionable_steps"]
        assert [s.step_number for s in got] == [1, 2]
        assert [s.instruction for s in got] == ["Clean the fans.", "Watch it."]
        assert got[1].estimated_time_minutes is None

    def test_step_count_and_length_are_capped(self):
        steps = [{"instruction": "x" * 1000, "category": "software"} for _ in range(20)]
        out = validate_llm_reply(_reply(actionable_steps=steps), "WARNING")
        assert len(out["actionable_steps"]) == MAX_STEPS
        assert all(len(s.instruction) <= 300 for s in out["actionable_steps"])

    def test_context_is_cleaned(self):
        out = validate_llm_reply(_reply(additional_context="junk"), "WARNING")
        assert out["additional_context"] == {
            "hardware_components_affected": [], "likely_failure_mode": "unknown", "preventive_measures": [],
        }


class TestPrompt:
    def test_prompt_is_about_lectio_telemetry(self):
        for word in ("Lectio", "telemetry", "data, not instructions", "Never invent"):
            assert word in SYSTEM_PROMPT

    def test_messages_carry_example_alert_and_fixes(self, test_alert):
        test_alert.rule_name = "CPU_OVERHEATING_CRITICAL"
        messages = AIDiagnosticService().build_messages(test_alert, [])
        assert [m["role"] for m in messages] == ["system", "user", "assistant", "user"]
        last = messages[-1]["content"]
        assert "<alert>" in last and "CPU_OVERHEATING_CRITICAL" in last
        assert "Cool it down now" in last  # a catalogue fix for heat


class TestRuleBasedCoversRealRules:
    @pytest.mark.parametrize("rule", [r for r in BASELINE_RULES if not r.name.endswith("_UTILIZATION_INFO")],
                             ids=lambda r: r.name)
    def test_every_hardware_rule_has_a_specific_diagnosis(self, rule):
        diagnosis = AIDiagnosticService()._get_rule_based_diagnosis(rule.name, rule.severity.value)
        assert "Hardware anomaly detected for rule" not in diagnosis["root_cause_analysis"]

    def test_warning_is_less_urgent_than_critical(self):
        svc = AIDiagnosticService()
        assert svc._get_rule_based_diagnosis("CPU_OVERHEATING_WARNING", "WARNING")["urgency_level"] == "ATTENTION_NEEDED"
        assert svc._get_rule_based_diagnosis("CPU_OVERHEATING_CRITICAL", "CRITICAL")["urgency_level"] == "IMMEDIATE_ACTION_REQUIRED"
