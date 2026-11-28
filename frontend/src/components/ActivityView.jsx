import React, { useEffect, useState } from "react";
import { CalendarCheck, Flame, LogIn, Monitor, ShieldAlert, TriangleAlert, Wrench } from "lucide-react";
import { fetchActivity } from "../services/api";
import { Card, Empty } from "./ui";
import { cx } from "./format";

/**
 * The Activity log (approved design A): one list of the last 7 days, filter
 * chips, grouped by day. Each entry: an icon for its kind, what happened in
 * plain words, the PC or browser, and the time. Alerts get a Fix button.
 */
const FILTERS = [
  { id: "all", label: "All" },
  { id: "signin", label: "Sign-ins" },
  { id: "alerts", label: "Alerts" },
  { id: "fixes", label: "Fixes" },
  { id: "pcs", label: "PCs" },
  { id: "security", label: "Security" },
];

const ICONS = { signin: LogIn, alerts: TriangleAlert, fixes: Wrench, pcs: Monitor, security: ShieldAlert };

function iconFor(item) {
  if (item.kind === "alerts" && item.tone === "bad") return Flame;
  if (item.kind === "pcs" && item.title.startsWith("Daily")) return CalendarCheck;
  return ICONS[item.kind] || LogIn;
}

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

export function ActivityView({ onOpenAlert }) {
  const [filter, setFilter] = useState("all");
  const [state, setState] = useState({ status: "loading", items: [] });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));
    fetchActivity(filter)
      .then((res) => !cancelled && setState({ status: "ready", items: res?.items || [] }))
      .catch((err) => !cancelled && setState({ status: "error", items: [], error: err.message }));
    return () => { cancelled = true; };
  }, [filter]);

  const groups = [];
  for (const item of state.items) {
    const at = new Date(item.at);
    const label = dayLabel(at);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push({ ...item, time: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  }

  return (
    <div className="page">
      <Card className="pad col act">
        <div className="row ac">
          <h3 className="act-title">Activity log</h3>
          <span className="f1" />
          <span className="sub">Kept for 7 days</span>
        </div>
        <div className="act-chips" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={cx("act-chip", filter === f.id && "on")} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>

        {state.status === "loading" && <p className="sub" role="status">Loading your activity…</p>}
        {state.status === "error" && <p className="note w" role="alert">{state.error}</p>}
        {state.status === "ready" && groups.length === 0 && (
          <Empty title="Nothing here yet">Sign-ins, alerts, fixes and your PCs' news from the last 7 days show up here.</Empty>
        )}

        {groups.map((g) => (
          <section key={g.label} className="act-day" aria-label={g.label}>
            <h4 className="act-day-title">{g.label}</h4>
            <ul className="act-list">
              {g.items.map((item) => {
                const Icon = iconFor(item);
                return (
                  <li key={item.id} className="act-row">
                    <span className={cx("act-ico", item.tone)} aria-hidden="true"><Icon strokeWidth={2} /></span>
                    <span className="act-text">
                      <b>{item.title}</b>
                      {item.detail && <span className="sub">{item.detail}</span>}
                    </span>
                    {item.alert_id && (
                      <button type="button" className="bk am-fix" onClick={() => onOpenAlert?.(item.alert_id)}>
                        <Wrench strokeWidth={2} aria-hidden="true" /> Fix
                      </button>
                    )}
                    <span className="sub act-time">{item.time}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </Card>
    </div>
  );
}
