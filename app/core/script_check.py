"""
Whether an AI-written PowerShell fix may run ("Solve with AI").

The same rules as the agent (agent-go/internal/scriptcheck): only listed
commands, nothing that downloads, hides or launches other code, nothing that
touches security settings, accounts, Lectio itself or deletes files. The rules
are in script_rules.json, a copy of the agent's (tests/test_script_check.py
checks they match). The server checks before showing a script and before
queuing it; the agent checks again before asking on the PC.

This narrows what a tricked AI could do; it isn't a sandbox. The person at the
PC reading the exact script and clicking Allow is the other half.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

RULES_FILE = Path(__file__).with_name("script_rules.json")
RULES = json.loads(RULES_FILE.read_text(encoding="utf-8"))
_ALLOWED = set(RULES["allowed_commands"])
_KEYWORDS = set(RULES["keywords"])
_STRING = re.compile(r"'[^'\n]*'|\"[^\"\n]*\"")
_SPLIT = re.compile(r"[\n;|{}()=]")
_FIRST = re.compile(r"[A-Za-z0-9_.\-]+")


@dataclass(frozen=True)
class Result:
    ok: bool
    reason: str = ""
    read_only: bool = False


def _no(reason: str) -> Result:
    return Result(ok=False, reason=reason)


def check(script: str) -> Result:
    text = (script or "").replace("\r\n", "\n").strip()
    if not text:
        return _no("the script is empty")
    if len(text) > RULES["max_chars"] or text.count("\n") + 1 > RULES["max_lines"]:
        return _no(f"the script is too long (at most {RULES['max_lines']} lines)")
    low = text.lower()
    for bad in RULES["blocked_text"]:
        if bad in low:
            return _no(f'it contains "{bad}", which Lectio doesn\'t allow')

    kept = "\n".join(line for line in text.split("\n") if not line.strip().startswith("#"))
    code = _STRING.sub(lambda m: m.group(0)[0] * 2, kept)
    if "'" in code.replace("''", "").replace('""', "") or '"' in code.replace("''", "").replace('""', ""):
        return _no("a quote is never closed")
    for ch in RULES["blocked_characters"]:
        if ch in code:
            return _no(f'it uses "{ch}", which Lectio doesn\'t allow')

    read_only = True
    for seg in _SPLIT.split(code):
        s = seg.strip()
        if not s:
            continue
        c = s[0]
        if c in "$'\"[-!" or c.isdigit():
            continue
        if c == ".":
            if len(s) > 1 and (s[1] == "_" or s[1].isascii() and s[1].isalpha()):
                continue  # a property of what's in brackets before it
            return _no("it runs another script, which Lectio doesn't allow")
        m = _FIRST.match(s)
        if not m:
            return _no(f'it contains "{s[:20]}", which Lectio can\'t check')
        word = m.group(0)
        w = word.lower().removesuffix(".exe")
        if w in _KEYWORDS:
            continue
        if w not in _ALLOWED:
            return _no(f'it runs "{word}", which Lectio doesn\'t allow')
        if not any(w.startswith(p) for p in RULES["read_only_prefixes"]):
            read_only = False
    # Setting a property ($p.PriorityClass = ...) changes something.
    parts = code.split("=")
    for before in parts[:-1]:
        cut = max(before.rfind(ch) for ch in "\n;|{}()")
        if "." in before[cut + 1:]:
            read_only = False
    return Result(ok=True, read_only=read_only)
