"""The shared Gemini call: minimal thinking, room to answer, a second model as backup."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from openai import APIError

from app.core.config import settings
from app.services.llm import NoAnswer, chat_json


def reply(text):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


def client(*replies):
    c = MagicMock()
    c.chat.completions.create = AsyncMock(side_effect=list(replies))
    return c


async def test_asks_with_minimal_thinking_and_room_to_answer(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_MODEL", "fast")
    c = client(reply('{"cause": "dust"}'))
    data, model = await chat_json(c, [{"role": "user", "content": "hi"}])
    assert data == {"cause": "dust"} and model == "fast"
    kwargs = c.chat.completions.create.call_args.kwargs
    assert kwargs["reasoning_effort"] == settings.GEMINI_REASONING_EFFORT
    assert kwargs["max_tokens"] >= 1024
    assert kwargs["response_format"] == {"type": "json_object"}


async def test_an_empty_answer_tries_the_backup_model(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_MODEL", "fast")
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "backup")
    c = client(reply(None), reply('{"ok": true}'))
    data, model = await chat_json(c, [])
    assert model == "backup" and data == {"ok": True}


async def test_no_usable_answer_means_built_in_rules(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_MODEL", "fast")
    monkeypatch.setattr(settings, "GEMINI_FALLBACK_MODEL", "backup")
    err = APIError("boom", request=MagicMock(), body=None)
    with pytest.raises(NoAnswer):
        await chat_json(client(err, reply("not json")), [])


async def test_no_key_means_no_call():
    with pytest.raises(NoAnswer):
        await chat_json(None, [])
