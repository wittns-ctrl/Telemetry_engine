"""
Choosing and explaining fix options for an alert.

The AI only orders and explains fixes it is given (catalogue fixes that fit
the alert); it can't add one, and its wording is length-limited. Without an
Gemini key, or if the reply is missing or odd, the same options come back in
catalogue order with built-in plain reasons.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Optional

from openai import AsyncOpenAI, AuthenticationError, PermissionDeniedError

from app.core.config import settings
from app.core.fix_catalogue import Fix
from app.models.alert import AnomalyAlertDocument

logger = logging.getLogger(__name__)

MAX_PC_OPTIONS = 3
MAX_REASON = 120

# Built-in reasons, used when the AI isn't available.
REASONS = {
    "cool_down": "Cuts the heat right away, at the cost of a little speed for an hour.",
    "balanced_power": "Stops the PC running flat out when it doesn't need to.",
    "clear_temp_files": "Frees space on the drive with nothing you'll miss.",
    "close_app": "Stops the program that's working the PC hardest.",
    "disable_startup_app": "Fewer programs running in the background from the moment you log in.",
    "restart_service": "A quick off-and-on often clears a stuck part of Windows.",
    "repair_system_files": "Windows checks its own files and repairs any that are damaged.",
    "check_disk": "Windows looks over the drive for problems without changing anything.",
    "clean_fans": "Dust is the most common reason a PC slowly gets hotter.",
    "back_up_now": "If the drive fails, a backup is the only way to keep your files.",
    "check_power_supply": "Unsteady power can damage parts, and only a person can test it safely.",
}


@dataclass
class Option:
    fix: Fix
    reason: str
    recommended: bool = False


def _fallback(candidates: list[Fix]) -> list[Option]:
    runnable = [f for f in candidates if not f.manual][:MAX_PC_OPTIONS]
    manual = [f for f in candidates if f.manual]
    options = [Option(f, REASONS.get(f.id, f.summary)) for f in runnable + manual]
    if options:
        options[0].recommended = True
    return options


def _clean_reason(text: object) -> Optional[str]:
    if not isinstance(text, str):
        return None
    text = " ".join(text.split())
    if not text:
        return None
    return text if len(text) <= MAX_REASON else text[: MAX_REASON - 1].rstrip() + "…"


class FixAdvisor:
    def __init__(self, client: Optional[AsyncOpenAI] = None):
        if client is None and settings.GEMINI_API_KEY:
            # Gemini through its OpenAI-compatible endpoint.
            client = AsyncOpenAI(
                api_key=settings.GEMINI_API_KEY,
                base_url=settings.GEMINI_BASE_URL,
                timeout=settings.GEMINI_FIX_TIMEOUT_SECONDS,
                max_retries=0,  # a retry would double the wait; the built-in order is the fallback
            )
        self.client = client

    async def options_for(self, alert: AnomalyAlertDocument, candidates: list[Fix]) -> tuple[list[Option], str]:
        """Options for an alert, best first, and where they came from ("ai" or "rules")."""
        if not candidates:
            return [], "rules"
        if self.client is None:
            return _fallback(candidates), "rules"
        try:
            chosen = await self._ask(alert, candidates)
        except (AuthenticationError, PermissionDeniedError) as e:
            # A bad or expired key won't fix itself: stop asking until restart.
            logger.error(f"Gemini rejected the API key; fix options use the built-in order until restart: {e}")
            self.client = None
            return _fallback(candidates), "rules"
        except Exception as e:
            logger.warning(f"Fix advice from the AI failed, using built-in order: {e}")
            return _fallback(candidates), "rules"
        return chosen or _fallback(candidates), ("ai" if chosen else "rules")

    async def _ask(self, alert: AnomalyAlertDocument, candidates: list[Fix]) -> list[Option]:
        runnable = [f for f in candidates if not f.manual]
        listing = "\n".join(f"- {f.id}: {f.title}. {f.summary}" for f in runnable)
        prompt = f"""A home PC raised this alert:
{alert.message} (rule {alert.rule_name}, value {alert.trigger_value}, limit {alert.threshold_limit}, severity {alert.severity.value})

Fixes Lectio can carry out on the PC (choose ONLY from these ids):
{listing}

Pick up to {MAX_PC_OPTIONS} that would help most, best first. For each, write one short, friendly sentence
(at most 15 words, no jargon) saying why it helps this person. Reply as JSON:
{{"options": [{{"id": "...", "reason": "..."}}]}}"""
        response = await self.client.chat.completions.create(
            model=settings.GEMINI_MODEL,
            messages=[
                {"role": "system", "content": "You help non-technical people fix their PCs. Be brief, plain and calm."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content or "{}")
        allowed = {f.id: f for f in runnable}
        options: list[Option] = []
        for item in data.get("options", []) if isinstance(data, dict) else []:
            fix = allowed.pop(item.get("id"), None) if isinstance(item, dict) else None
            if fix is None:
                continue  # unknown, repeated or not offered: ignored
            options.append(Option(fix, _clean_reason(item.get("reason")) or REASONS.get(fix.id, fix.summary)))
            if len(options) == MAX_PC_OPTIONS:
                break
        if not options:
            return []
        options[0].recommended = True
        # Things only the user can do are always offered, after the PC fixes.
        options += [Option(f, REASONS.get(f.id, f.summary)) for f in candidates if f.manual]
        return options


fix_advisor = FixAdvisor()
