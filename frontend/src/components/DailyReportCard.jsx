import React, { useEffect, useRef, useState } from "react";
import { fetchReports } from "../services/api";
import { cx } from "./format";

const LINKED = "lectio_linked_report";

function dayName(day) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

const toneOf = (score) => (score >= 85 ? "good" : score >= 65 ? "fair" : "bad");

/**
 * The end-of-day health check (approved design A): the score out of 100 in a
 * ring, what was found today, then a numbered "What to do" list. Older checks
 * (30 days) are one click away.
 */
export function DailyReportCard({ device }) {
  const [reports, setReports] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchReports(device.id)
      .then((list) => {
        if (cancelled) return;
        setReports(list || []);
        let linked = null;
        try { linked = sessionStorage.getItem(LINKED); } catch { /* storage blocked */ }
        if (linked && (list || []).some((r) => r.id === linked)) {
          setPickedId(linked);
          try { sessionStorage.removeItem(LINKED); } catch { /* storage blocked */ }
          setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        }
      })
      .catch(() => !cancelled && setReports([]));
    return () => { cancelled = true; };
  }, [device.id]);

  if (!reports) return null;
  if (reports.length === 0) {
    return (
      <article className="card pad dr dr-empty" ref={ref}>
        <h3 className="dr-title">Daily check</h3>
        <p className="txt">Every evening at 8 pm, {device.device_name} checks its whole day and a report with what to do appears here. It needs Lectio agent 1.3.0 or later.</p>
      </article>
    );
  }

  const report = reports.find((r) => r.id === pickedId) || reports[0];
  const tone = toneOf(report.score ?? 0);
  return (
    <article className="card pad dr" ref={ref} aria-label="Daily check">
      <div className="row ac dr-head">
        <span className={cx("dr-ring", tone)} style={{ "--p": `${report.score ?? 0}` }}>
          <b>{report.score ?? "–"}</b>
        </span>
        <span className="f1">
          <h3 className="dr-title">Daily check · {dayName(report.day)}</h3>
          <span className="sub">{device.device_name} · {report.verdict}</span>
        </span>
        {reports.length > 1 && (
          <select className="inp dr-pick" aria-label="Show the daily check for" value={report.id} onChange={(e) => setPickedId(e.target.value)}>
            {reports.map((r) => <option key={r.id} value={r.id}>{dayName(r.day)} · {r.score}/100</option>)}
          </select>
        )}
      </div>

      {report.summary && <p className="txt dr-summary">{report.summary}</p>}

      <h4 className="dr-sub">What it found</h4>
      <ul className="dr-found">
        {report.findings.map((f, i) => <li key={i} className={f.tone}>{f.text}</li>)}
      </ul>

      <h4 className="dr-sub">What to do</h4>
      <ol className="dr-todo">
        {report.todo.map((t, i) => <li key={i}>{t}</li>)}
      </ol>
      <p className="sub dr-source">{report.source === "ai" ? "Written with AI from the day's readings" : "From the day's readings"}</p>
    </article>
  );
}
