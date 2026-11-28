"""
One way to ask Gemini for a JSON answer, shared by the diagnosis, the fix
advice and the daily health report.

Why this exists: "thinking" models such as gemini-3.5-flash spent 20-35 s and
their whole answer budget reasoning, returning empty or cut-off replies, so
every caller fell back to its built-in rules. Here the thinking is kept to a
minimum, the answer has room, and a second model is tried before giving up.
"""

import json
import logging
from typing import Optional

from openai import APIError, AuthenticationError, NotFoundError, PermissionDeniedError

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_ANSWER_TOKENS = 2048


class NoAnswer(Exception):
    """No model gave a usable JSON answer; callers use their built-in rules."""


def models() -> list[str]:
    chain = [settings.GEMINI_MODEL, settings.GEMINI_FALLBACK_MODEL]
    return [m for i, m in enumerate(chain) if m and m not in chain[:i]]


async def chat_json(client, messages: list[dict], *, temperature: float = 0.2) -> tuple[dict, str]:
    """(the parsed JSON answer, the model that gave it). Raises NoAnswer."""
    if client is None:
        raise NoAnswer("no Gemini key")
    last: Optional[Exception] = None
    for model in models():
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                response_format={"type": "json_object"},
                max_tokens=MAX_ANSWER_TOKENS,
                reasoning_effort=settings.GEMINI_REASONING_EFFORT,
            )
            text = response.choices[0].message.content or ""
            data = json.loads(text) if text.strip() else None
            if isinstance(data, dict) and data:
                return data, model
            last = NoAnswer(f"{model} returned an empty or non-object answer")
            logger.warning("Gemini %s gave no usable answer; trying the next model", model)
        except (AuthenticationError, PermissionDeniedError):
            raise  # a bad key fails every model alike
        except NotFoundError as e:
            last = e
            logger.error("Gemini model %s doesn't exist (any more); set GEMINI_MODEL to a current one", model)
        except (APIError, json.JSONDecodeError, TimeoutError) as e:
            last = e
            logger.warning("Gemini %s failed (%s); trying the next model", model, type(e).__name__)
    raise NoAnswer(str(last) if last else "no model configured")
