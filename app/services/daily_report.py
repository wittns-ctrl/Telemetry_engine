"""
The end-of-day health check: the agent asks for it at 8 pm (PC time), and
this reviews the whole day — temperatures, load, memory, drives, hardware
errors, alerts, fixes, Microsoft Defender and uptime — into a score out of
100, plain-language findings and a short "what to do" list.

The findings and score are always worked out here from the data, so they are
right even without the AI; Gemini only rewrites the summary and to-do list in
friendlier words, and is ignored if it fails.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.daily_report import DailyReport, Finding
from app.models.fix import FixRequest
from app.models.rollup import TelemetryRollupDocument
from app.models.telemetry import Device, TelemetrySnapshotDocument
from app.services.llm import NoAnswer, chat_json

logger = logging.getLogger(__name__)


def day_window(day: str, utc_offset_minutes: int) -> tuple[datetime, datetime]:
    """The PC's local day as a UTC [start, end)."""
    local_midnight = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    start = local_midnight - timedelta(minutes=utc_offset_minutes)
    return start, start + timedelta(days=1)


def _combine(hours: list[TelemetryRollupDocument]) -> dict[str, dict]:
    """Per reading key over the day: avg, lo, hi."""
    out: dict[str, dict] = {}
    for h in hours:
        for key, total in h.sums.items():
            s = out.setdefault(key, {"sum": 0.0, "n": 0, "lo": None, "hi": None})
            s["sum"] += total
            s["n"] += h.n.get(key, 0)
            lo, hi = h.lo.get(key), h.hi.get(key)
            if lo is not None:
                s["lo"] = lo if s["lo"] is None else min(s["lo"], lo)
            if hi is not None:
                s["hi"] = hi if s["hi"] is None else max(s["hi"], hi)
    return {k: {"avg": v["sum"] / v["n"] if v["n"] else None, "lo": v["lo"], "hi": v["hi"]} for k, v in out.items()}


def _hi(stats, key):
    return (stats.get(key) or {}).get("hi")


def _avg(stats, key):
    return (stats.get(key) or {}).get("avg")


def analyse(stats: dict, alerts: list, fixes: list, security, latest: Optional[dict], readings: int) -> dict:
    """Score, findings and to-do from the day's data (no AI)."""
    score, findings, todo = 100, [], []

    def find(area, text, tone="ok"):
        findings.append(Finding(area=area, text=text, tone=tone))

    # Heat
    cpu_hot = max([v for v in (_hi(stats, "cpu__core_temperature_c"), _hi(stats, "cpu__package_temperature_c")) if v is not None], default=None)
    gpu_hot = _hi(stats, "gpu__core_temperature_c")
    if cpu_hot is not None:
        if cpu_hot >= 95:
            score -= 10
            find("heat", f"The processor reached {cpu_hot:.0f}°C, at its limit.", "bad")
            todo.append("Clean dust from the fans and vents, and keep the air vents clear")
        elif cpu_hot >= 85:
            score -= 5
            find("heat", f"The processor ran hot, peaking at {cpu_hot:.0f}°C.", "warn")
            todo.append("Check the PC's fans and vents for dust")
        else:
            find("heat", f"Temperatures were fine (processor peak {cpu_hot:.0f}°C).")
    if gpu_hot is not None and gpu_hot >= 85:
        score -= 5
        find("heat", f"The graphics card peaked at {gpu_hot:.0f}°C.", "warn")

    # Load and memory
    cpu_avg = _avg(stats, "cpu__utilization_percent")
    if cpu_avg is not None:
        find("load", f"The processor was {cpu_avg:.0f}% busy on average." + (" That's high for a whole day." if cpu_avg >= 60 else ""),
             "warn" if cpu_avg >= 60 else "ok")
    ram_avg, ram_hi = _avg(stats, "ram__usage_percent"), _hi(stats, "ram__usage_percent")
    if ram_avg is not None:
        if ram_hi is not None and ram_hi >= 95:
            score -= 5
            find("memory", f"Memory nearly ran out (peak {ram_hi:.0f}%).", "warn")
            todo.append("Close programs and browser tabs you aren't using; restart if it stays high")
        else:
            find("memory", f"Memory use was fine ({ram_avg:.0f}% on average).")

    # Storage (from the newest reading)
    drives = (latest or {}).get("storage") or []
    c_free = next((d.get("available_capacity_gb") for d in drives if (d.get("device_name") or "").rstrip("\\/").upper() == "C:"), None)
    fullest = max([(1 - d["available_capacity_gb"] / d["total_capacity_gb"]) * 100 for d in drives
                   if d.get("available_capacity_gb") is not None and d.get("total_capacity_gb")], default=None)
    if c_free is not None and c_free < 15:
        score -= 10
        find("storage", f"Only {c_free:.1f} GB free on drive C:.", "bad")
        todo.append("Free up space on drive C: (Clear temporary files, empty the Recycle Bin)")
    elif fullest is not None and fullest >= 85:
        score -= 5
        find("storage", f"A drive is {fullest:.0f}% full.", "warn")
        todo.append("Move or delete large files you no longer need")
    elif c_free is not None:
        find("storage", f"Storage is fine ({c_free:.0f} GB free on C:).")

    # Hardware errors
    whea = _hi(stats, "ram__whea_error_count")
    if whea:
        score -= 10
        find("stability", f"Windows logged {whea:.0f} hardware error(s).", "bad")
        todo.append("Run Windows Memory Diagnostic and update the PC's drivers")

    # Alerts and fixes
    crit = [a for a in alerts if a.severity == AlertSeverity.CRITICAL]
    warn = [a for a in alerts if a.severity == AlertSeverity.WARNING]
    score -= min(45, 15 * len(crit)) + min(20, 5 * len(warn))
    if crit or warn:
        names = list(dict.fromkeys(a.message.split(":")[0] for a in crit + warn))
        find("alerts", f"{len(crit)} critical and {len(warn)} warning alert(s): {', '.join(names[:3])}.", "bad" if crit else "warn")
    else:
        find("alerts", "No alerts today.")
    done = [f for f in fixes if f.status.value == "succeeded"]
    if done:
        find("alerts", f"{len(done)} fix(es) carried out on the PC.")

    # Security
    if security is not None:
        active = [t for t in security.threats if t.active]
        stopped_today = [t for t in security.threats if not t.active and t.detected_at >= datetime.now(timezone.utc) - timedelta(days=1)]
        if active:
            score -= 30
            find("security", f"Malware found that still needs removing: {active[0].name}.", "bad")
            todo.insert(0, "Remove the threat: open the Security tab and click Remove threat")
        elif security.realtime_protection is False and not security.other_antivirus:
            score -= 25
            find("security", "Virus protection is switched off.", "bad")
            todo.insert(0, "Turn Microsoft Defender's real-time protection back on")
        elif stopped_today:
            score -= 10
            find("security", f"Defender stopped malware today: {stopped_today[0].name}.", "warn")
            todo.append("Scan any USB drives you used today before opening files on them")
        elif (security.definitions_age_days or 0) >= 3:
            score -= 5
            find("security", f"Virus definitions are {security.definitions_age_days} days old.", "warn")
            todo.append("Update virus definitions")
        else:
            find("security", f"Protected by {security.antivirus or 'Microsoft Defender'}; no threats.")

    # Uptime
    uptime = _hi(stats, "cpu__uptime_seconds")
    if uptime is not None and uptime >= 14 * 86400:
        score -= 5
        find("stability", f"Not restarted for {uptime / 86400:.0f} days.", "warn")
        todo.append("Restart the PC to finish updates")

    score = max(0, min(100, score))
    verdict = "good overall" if score >= 85 else "fair: some things need a look" if score >= 65 else "needs attention"
    if not todo:
        todo.append("Nothing to do: keep it up")
    bad = [f for f in findings if f.tone != "ok"]
    summary = (f"A healthy day: {findings[0].text[0].lower() + findings[0].text[1:]}" if not bad and findings else
               " ".join(f.text for f in bad[:2]))
    return {"score": score, "verdict": verdict, "findings": findings[:12], "todo": list(dict.fromkeys(todo))[:6],
            "summary": summary[:600], "readings": readings}


async def _polish(result: dict, device_name: str, client) -> tuple[dict, str]:
    """Friendlier summary and to-do from the AI; the facts stay the same."""
    facts = "\n".join(f"- [{f.tone}] {f.text}" for f in result["findings"])
    todo = "\n".join(f"- {t}" for t in result["todo"])
    try:
        data, _ = await chat_json(client, [
            {"role": "system", "content": "You write short, calm daily PC health notes for non-technical people. "
                                          "Use only the facts given. No jargon. Reply as JSON."},
            {"role": "user", "content": f"PC: {device_name}. Score {result['score']}/100.\nFindings:\n{facts}\n"
                                        f"Suggested actions:\n{todo}\n\nReply as "
                                        '{"summary": "2-3 sentences about the day", "todo": ["up to 4 short actions, most important first"]}'},
        ])
    except NoAnswer:
        return result, "rules"
    summary = data.get("summary") if isinstance(data.get("summary"), str) else None
    actions = [t.strip() for t in data.get("todo", []) if isinstance(t, str) and t.strip()][:4]
    if not summary:
        return result, "rules"
    return {**result, "summary": " ".join(summary.split())[:600], "todo": actions or result["todo"]}, "ai"


async def build(device: Device, day: str, utc_offset_minutes: int, client=None) -> Optional[DailyReport]:
    """The day's report for the device (stored once per day); None without readings."""
    existing = await DailyReport.find_one(DailyReport.device_id == device.id, DailyReport.day == day)
    if existing:
        return existing
    start, end = day_window(day, utc_offset_minutes)
    hours = await TelemetryRollupDocument.find(
        TelemetryRollupDocument.device_id == device.id, TelemetryRollupDocument.granularity == "hour",
        TelemetryRollupDocument.start >= start - timedelta(hours=1), TelemetryRollupDocument.start < end,
    ).to_list()
    readings = sum(h.readings for h in hours)
    if not readings:
        return None
    alerts = await AnomalyAlertDocument.find(
        AnomalyAlertDocument.device_id == device.id, AnomalyAlertDocument.created_at >= start,
        AnomalyAlertDocument.created_at < end,
    ).to_list()
    fixes = await FixRequest.find(
        FixRequest.device_id == device.id, FixRequest.created_at >= start, FixRequest.created_at < end,
    ).to_list()
    newest = await TelemetrySnapshotDocument.get_pymongo_collection().find_one(
        {"device_id": device.id, "timestamp": {"$lt": end}}, sort=[("timestamp", -1)], projection={"storage": 1})
    result = analyse(_combine(hours), alerts, fixes, device.security, newest, readings)
    result, source = await _polish(result, device.device_name, client)
    report = DailyReport(user_id=device.user_id, device_id=device.id, day=day, source=source, **result)
    try:
        await report.insert()
    except Exception:  # asked twice at once: the other request stored it
        return await DailyReport.find_one(DailyReport.device_id == device.id, DailyReport.day == day) or report
    return report
