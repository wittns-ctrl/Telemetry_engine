import React, { useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import { requestFix } from "../services/api";
import { TITLES, securityEvents, securityLevel, toneOf, when } from "./security";

const ICONS = { bad: ShieldX, warn: ShieldAlert, good: ShieldCheck, none: ShieldQuestion };
const SHOWN = 6;

/**
 * The Security tab (approved design D): the PC's status with the one action
 * that matters most, then what happened, newest first, then scan and update.
 * Every button asks the PC's agent to have Microsoft Defender act; Lectio
 * itself never deletes anything.
 */
export function SecurityCard({ security, device, onOpenAlerts }) {
  const level = securityLevel(security);
  const tone = toneOf(level);
  const Icon = ICONS[tone];
  const events = securityEvents(security);
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(null);
  const [note, setNote] = useState(null);

  const send = async (fixId, label) => {
    setSending(fixId);
    setNote(null);
    try {
      await requestFix(device.id, { fixId });
      setNote({ ok: true, text: `${label}: sent to ${device.device_name}. You can follow it on My Devices.` });
    } catch (err) {
      setNote({ ok: false, text: err.message });
    } finally {
      setSending(null);
    }
  };

  const primary = level === "threat"
    ? <button type="button" className="bk" disabled={!!sending} onClick={() => send("defender_remove_threats", "Remove threat")}>Remove threat</button>
    : level === "off" || level === "disguised"
      ? <button type="button" className="bk" onClick={onOpenAlerts}>See what to do</button>
      : null;

  return (
    <article className="card pad sec" aria-label="Security">
      <div className="row ac sec-head">
        <span className={`sec-icon ${tone}`}><Icon strokeWidth={1.9} aria-hidden="true" /></span>
        <h3 className={`sec-title ${tone}`}>{TITLES[level]}</h3>
        <span className="f1" />
        {primary}
      </div>

      {events.length === 0 ? (
        <p className="txt">
          {security ? "Nothing has happened yet: no threats, scans or updates to show." : "This PC's Lectio agent doesn't report virus protection yet. Install the latest agent to see it here."}
        </p>
      ) : (
        <ol className="sec-tl">
          {(showAll ? events : events.slice(0, SHOWN)).map((e, i) => (
            <li key={`${e.at}-${i}`} className={e.tone}>
              <b>{when(e.at)} · {e.title}</b>
              {e.detail && <span>{e.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {events.length > SHOWN && (
        <button type="button" className="sec-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${events.length}`}
        </button>
      )}

      {security && (
        <div className="row ac wrap">
          <button type="button" className="bk ol" disabled={!!sending} onClick={() => send("defender_quick_scan", "Quick scan")}>
            {sending === "defender_quick_scan" ? "Sending…" : "Quick scan"}
          </button>
          <button type="button" className="bk ol" disabled={!!sending} onClick={() => send("defender_update", "Update definitions")}>
            {sending === "defender_update" ? "Sending…" : "Update definitions"}
          </button>
        </div>
      )}
      {note && <p className={note.ok ? "ap-sent" : "note w"} role={note.ok ? "status" : "alert"}>{note.text}</p>}
    </article>
  );
}
