import React, { useEffect, useState } from "react";
import { OctagonAlert, PlugZap } from "lucide-react";
import { fetchIncidents, requestFix } from "../services/api";
import { cx } from "./format";

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function when(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === new Date(today.getTime() - 86400000).toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

function headline(pc, i) {
  if (!i.back_at) return `${pc} is offline`;
  if (i.cause === "bluescreen") return `${pc} crashed`;
  if (i.cause === "connection") return `${pc} lost its connection`;
  return `${pc} stopped unexpectedly`;
}

function sub(i) {
  const day = when(i.went_silent_at);
  if (!i.back_at) return `${day} · silent since ${time(i.went_silent_at)}`;
  const m = i.minutes_off ?? 0;
  const off = m < 60 ? `${Math.max(1, m)} minute${m === 1 ? "" : "s"}` : `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${day} · off for ${off}`;
}

/**
 * Design D: when a PC stopped without shutting down normally, the story in
 * order (what happened just before, when it went silent, when it came back
 * and why), with what to do next. Only shows when there was an outage in the
 * last 7 days.
 */
export function IncidentCard({ device, onSeeReadings }) {
  const [incidents, setIncidents] = useState([]);
  const [scan, setScan] = useState(null); // null, sending, sent, or an error message

  useEffect(() => {
    let cancelled = false;
    fetchIncidents(device.id)
      .then((list) => !cancelled && setIncidents(list || []))
      .catch(() => !cancelled && setIncidents([]));
    return () => { cancelled = true; };
  }, [device.id]);

  if (incidents.length === 0) return null;
  const i = incidents[0];
  const earlier = incidents.length - 1;
  const ongoing = !i.back_at;

  const runScan = async () => {
    setScan("sending");
    try {
      await requestFix(device.id, { fixId: "defender_full_scan" });
      setScan("sent");
    } catch (err) {
      setScan(err.message);
    }
  };

  return (
    <article className="card pad inc" aria-label="Unexpected shutdown">
      <div className="row ac inc-head">
        <span className={cx("inc-ic", ongoing && "live")} aria-hidden="true">
          {ongoing ? <PlugZap strokeWidth={1.9} /> : <OctagonAlert strokeWidth={1.9} />}
        </span>
        <span className="f1">
          <h3 className="inc-title">{headline(device.device_name, i)}</h3>
          <span className="sub">{sub(i)}</span>
        </span>
      </div>

      <ol className="inc-line">
        {i.timeline.map((m, k) => (
          <li key={k} className={m.tone}>
            <time dateTime={m.at}>{time(m.at)}</time>
            <span>{m.text}</span>
          </li>
        ))}
      </ol>
      {i.cause === "bluescreen" && i.bugcheck_code && (
        <p className="sub inc-note">Stop code {i.bugcheck_code}. Search it on Microsoft's site to see what usually causes it.</p>
      )}
      {i.last_reading && <p className="sub inc-note">Just before, {i.last_reading}.</p>}

      <div className="row ac wrap inc-act">
        {!ongoing && scan !== "sent" && (
          <button type="button" className="bk gr" onClick={runScan} disabled={scan === "sending"}>
            {scan === "sending" ? "Sending…" : "Run a full scan"}
          </button>
        )}
        {scan === "sent" && <span className="sub" role="status">Full scan sent to {device.device_name}. It asks on the PC first.</span>}
        <button type="button" className="bk ol" onClick={onSeeReadings}>See readings</button>
        {earlier > 0 && <span className="sub">{earlier} earlier this week</span>}
      </div>
      {scan && !["sending", "sent"].includes(scan) && <p className="note w" role="alert">{scan}</p>}
    </article>
  );
}
