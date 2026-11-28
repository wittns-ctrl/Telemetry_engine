"""The AI script checker: same rules and same answers as the agent's."""

import json
from pathlib import Path

import pytest

from app.core.script_check import RULES, RULES_FILE, check

AGENT_RULES = Path(__file__).resolve().parents[1] / "agent-go" / "internal" / "scriptcheck" / "rules.json"


def test_rules_match_the_agents():
    if not AGENT_RULES.exists():
        pytest.skip("agent source not present")
    assert json.loads(AGENT_RULES.read_text(encoding="utf-8")) == json.loads(RULES_FILE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("script", RULES["examples"]["allowed"])
def test_allowed_examples_run(script):
    result = check(script)
    assert result.ok, result.reason


@pytest.mark.parametrize("script", RULES["examples"]["refused"])
def test_refused_examples_are_refused(script):
    assert not check(script).ok


def test_read_only():
    assert check("Get-Process | Sort-Object CPU -Descending | Select-Object -First 5").read_only
    assert not check("Restart-Service -Name Spooler").read_only
    assert not check("$p = Get-Process chrome\n$p.PriorityClass = 'BelowNormal'").read_only
    assert check("$p = Get-Process chrome\nWrite-Output $p.Id").read_only


def test_limits():
    assert not check("Get-Date\n" * 31).ok
    assert not check("   ").ok
