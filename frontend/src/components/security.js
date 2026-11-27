// A PC's virus protection in plain words, from the agent's security report
// (snapshot.security, or device.security until the first live reading).
// Used by the Security tab (approved design D), the summary's "Is it safe?"
// and the shield on My Devices.

const DAY = 24 * 60 * 60 * 1000;

const recent = (t, now = Date.now()) => now - new Date(t.detected_at).getTime() < DAY;

/** The overall state: "threat", "disguised", "off", "stopped", "old", "ok" or "unknown". */
export function securityLevel(sec) {
  if (!sec) return "unknown";
  if (sec.threats?.some((t) => t.active)) return "threat";
  if (sec.suspicious_processes?.length) return "disguised";
  const other = sec.antivirus && !/defender/i.test(sec.antivirus);
  if (sec.realtime_protection === false && !other) return "off";
  if (sec.threats?.some((t) => !t.active && recent(t))) return "stopped";
  if (!other && ((sec.definitions_age_days ?? 0) >= 3 || (sec.quick_scan_age_days ?? 0) > 14)) return "old";
  return "ok";
}

export const TITLES = {
  threat: "Threat found",
  disguised: "Suspicious program running",
  off: "Virus protection is off",
  stopped: "Malware stopped",
  old: "Protection out of date",
  ok: "Protected",
  unknown: "No security report yet",
};

/** "bad" (red), "warn" or "good", for colours and icons. */
export const toneOf = (level) =>
  ({ threat: "bad", disguised: "bad", off: "bad", stopped: "warn", old: "warn", ok: "good" }[level] || "none");

function ago(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? "a minute ago" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The summary's "Is it safe?" answer: { state, text }. */
export function safeAnswer(sec) {
  const level = securityLevel(sec);
  const active = (sec?.threats || []).filter((t) => t.active);
  const stopped = (sec?.threats || []).filter((t) => !t.active && recent(t));
  switch (level) {
    case "threat":
      return { state: "warn", text: `No. Malware found: ${active[0].name}${active.length > 1 ? ` and ${active.length - 1} more` : ""}. It still needs removing.` };
    case "disguised":
      return { state: "warn", text: `Possibly not. ${sec.suspicious_processes[0].name} is running from the wrong folder, a common malware disguise.` };
    case "off":
      return { state: "warn", text: "No. Virus protection is switched off, so new malware won't be stopped." };
    case "stopped":
      return { state: "warn", text: `Mostly. Defender stopped ${stopped[0].name} in the last day. Check where it came from.` };
    case "old":
      return {
        state: "warn",
        text: (sec.definitions_age_days ?? 0) >= 3
          ? `Mostly. Virus definitions are ${sec.definitions_age_days} days old.`
          : `Mostly. No virus scan for ${sec.quick_scan_age_days} days.`,
      };
    case "ok": {
      const scanned = ago(sec.last_quick_scan_at || sec.last_full_scan_at);
      return { state: "ok", text: `Yes. Protected by ${sec.antivirus || "Microsoft Defender"}${scanned ? `, last scanned ${scanned}` : ""}.` };
    }
    default:
      return { state: "unknown", text: "This PC doesn't report its virus protection yet. Update its Lectio agent." };
  }
}

const STATUS = {
  quarantined: "Quarantined by Defender",
  removed: "Removed by Defender",
  cleaned: "Cleaned by Defender",
  blocked: "Blocked by Defender",
  allowed: "Allowed on this PC",
  failed: "Defender couldn't remove it",
  detected: "Not dealt with yet",
  abandoned: "Not dealt with yet",
};

/** What happened, newest first: threats, scans and definition updates. */
export function securityEvents(sec) {
  if (!sec) return [];
  const events = (sec.threats || []).map((t) => ({
    at: t.detected_at,
    title: `${t.name} found`,
    detail: [t.path, t.active ? "Defender couldn't remove it" : STATUS[t.status] || "Dealt with by Defender",
      t.executed ? "it ran before being stopped" : null].filter(Boolean).join(" · "),
    tone: t.active ? "bad" : "",
  }));
  if (sec.last_quick_scan_at) events.push({ at: sec.last_quick_scan_at, title: "Quick scan finished", detail: "Microsoft Defender", tone: "" });
  if (sec.last_full_scan_at) events.push({ at: sec.last_full_scan_at, title: "Full scan finished", detail: "Microsoft Defender", tone: "" });
  if (sec.definitions_updated_at) {
    events.push({ at: sec.definitions_updated_at, title: "Definitions updated", detail: sec.definitions_version ? `Version ${sec.definitions_version}` : "", tone: "" });
  }
  for (const p of sec.suspicious_processes || []) {
    events.push({ at: sec.checked_at, title: `${p.name} running from the wrong folder`, detail: p.path, tone: "bad" });
  }
  return events.sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** "10:42", "Yesterday" or "26 Nov". */
export function when(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}
