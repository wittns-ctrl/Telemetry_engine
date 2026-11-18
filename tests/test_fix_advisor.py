"""The fix advisor: the AI may only order and explain the fixes it's given."""

import json
from types import SimpleNamespace

import pytest

from app.core.fix_catalogue import fixes_for
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.services.fix_advisor import MAX_REASON, FixAdvisor


def alert():
    return AnomalyAlertDocument.model_construct(
        rule_name="CPU_OVERHEATING_CRITICAL", severity=AlertSeverity.CRITICAL,
        metric_name="cpu_core_temperature_c", trigger_value=96, threshold_limit=90,
        message="CPU core temperature 96°C",
    )


CANDIDATES = [f for f in fixes_for("CPU_OVERHEATING_CRITICAL") if not any(p.required for p in f.params.values())]


class FakeAI:
    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.prompts = reply, error, []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def create(self, **kwargs):
        self.prompts.append(kwargs["messages"][-1]["content"])
        if self.error:
            raise self.error
        content = self.reply if isinstance(self.reply, str) else json.dumps(self.reply)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


async def test_without_ai_uses_catalogue_order():
    options, source = await FixAdvisor(client=None).options_for(alert(), CANDIDATES)
    assert source == "rules"
    assert options[0].fix.id == "cool_down" and options[0].recommended
    assert options[-1].fix.manual  # the user's own step comes last
    assert all(o.reason for o in options)


async def test_ai_orders_and_explains():
    ai = FakeAI({"options": [
        {"id": "balanced_power", "reason": "Your PC doesn't need full power right now."},
        {"id": "cool_down", "reason": "Cools it fast."},
    ]})
    options, source = await FixAdvisor(client=ai).options_for(alert(), CANDIDATES)
    assert source == "ai"
    assert [o.fix.id for o in options[:2]] == ["balanced_power", "cool_down"]
    assert options[0].recommended and not options[1].recommended
    assert options[0].reason == "Your PC doesn't need full power right now."
    assert options[-1].fix.id == "clean_fans"
    assert "cool_down" in ai.prompts[0] and "96" in ai.prompts[0]


async def test_ai_cannot_add_or_repeat_fixes():
    ai = FakeAI({"options": [
        {"id": "format_drive", "reason": "Start fresh!"},
        {"id": "close_app", "reason": "Not offered for this alert."},
        {"id": "cool_down", "reason": "First."},
        {"id": "cool_down", "reason": "Again."},
        {"id": "clean_fans", "reason": "Manual steps aren't the AI's to pick."},
    ]})
    options, _ = await FixAdvisor(client=ai).options_for(alert(), CANDIDATES)
    ids = [o.fix.id for o in options]
    assert ids.count("cool_down") == 1
    assert "format_drive" not in ids and "close_app" not in ids
    assert ids == ["cool_down", "clean_fans"]


async def test_long_reasons_are_cut():
    ai = FakeAI({"options": [{"id": "cool_down", "reason": "word " * 100}]})
    options, _ = await FixAdvisor(client=ai).options_for(alert(), CANDIDATES)
    assert len(options[0].reason) <= MAX_REASON


@pytest.mark.parametrize("ai", [
    FakeAI(error=TimeoutError("slow")),
    FakeAI(reply="not json"),
    FakeAI(reply={"options": []}),
    FakeAI(reply={"options": "cool_down"}),
    FakeAI(reply=["cool_down"]),
])
async def test_falls_back_when_the_ai_fails(ai):
    options, source = await FixAdvisor(client=ai).options_for(alert(), CANDIDATES)
    assert source == "rules"
    assert options[0].fix.id == "cool_down"


async def test_no_candidates():
    assert await FixAdvisor(client=FakeAI({"options": []})).options_for(alert(), []) == ([], "rules")


async def test_rejected_key_turns_the_ai_off():
    import httpx
    from openai import AuthenticationError

    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    error = AuthenticationError("expired", response=httpx.Response(401, request=request), body=None)
    ai = FakeAI(error=error)
    advisor = FixAdvisor(client=ai)
    options, source = await advisor.options_for(alert(), CANDIDATES)
    assert source == "rules" and options[0].fix.id == "cool_down"
    assert advisor.client is None
    await advisor.options_for(alert(), CANDIDATES)
    assert len(ai.prompts) == 1  # not asked again
