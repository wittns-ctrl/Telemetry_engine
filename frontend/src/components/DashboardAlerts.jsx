import React, { useCallback, useEffect, useState } from "react";
import { Bell, Check, ChevronUp, ShieldCheck, Sparkles, TriangleAlert, Info } from "lucide-react";
import { closeAlert, fetchFixHistory, requestDiagnosis, requestFix } from "../services/api";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { FixOptions } from "./fixes";
import { fixState } from "./fixState";
import { Chip, Ico } from "./ui";
import { cx, timeAgo } from "./format";

/**
 * The dashboard's Alerts tab (approved option B): the chosen alert fills the
 * big black card with its fix options, Diagnose and Close; the column beside
 * it lists the other open alerts and the latest fixes. `alerts` is kept up to
 * date by the dashboard's live connection.
 */
export function DashboardAlerts({ device, alerts, onAlertsChange, readingCount }) {
  const [selectedId, setSelectedId] = useState(null);
  const [fixes, setFixes] = useState([]);
  const [diagnosis, setDiagnosis] = useState({});
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState(null);

  const loadFixes = useCallback(() => {
    fetchFixHistory(device.id, { limit: 5 }).then((list) => setFixes(list || [])).catch(() => {});
  }, [device.id]);
  useEffect(loadFixes, [loadFixes]);

  const selected = alerts.find((a) => a.id === selectedId) || alerts[0] || null;
  const others = alerts.filter((a) => a !== selected);

  // A new selection starts with its diagnosis folded away.
  useEffect(() => {
    setShowDiagnosis(false);
    setError(null);
  }, [selected?.id]);

  const toggleDiagnosis = async () => {
    const opening = !showDiagnosis;
    setShowDiagnosis(opening);
    if (!opening || diagnosis[selected.id]?.status === "ready") return;
    setDiagnosis((prev) => ({ ...prev, [selected.id]: { status: "loading" } }));
    try {
      const report = await requestDiagnosis(selected.id, device.id);
      setDiagnosis((prev) => ({ ...prev, [selected.id]: { status: "ready", report } }));
    } catch (err) {
      setDiagnosis((prev) => ({ ...prev, [selected.id]: { status: "error", error: err } }));
    }
  };

  const close = async () => {
    setClosing(true);
    setError(null);
    try {
      await closeAlert(selected.id);
      onAlertsChange((list) => list.filter((a) => a.id !== selected.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setClosing(false);
    }
  };

  const sendFix = async ({ fixId }) => {
    await requestFix(device.id, { fixId, alertId: selected.id });
    loadFixes();
  };

  if (!selected) {
    return (
      <div className="al-wrap">
        <article className="card al-main al-calm">
          <Ico icon={ShieldCheck} tone="g" />
          <h3>No open alerts on {device.device_name}</h3>
          <p className="txt">Lectio is watching {readingCount} readings and will pop up here the moment one goes over its limit.</p>
        </article>
        <RecentFixes fixes={fixes} pc={device.device_name} />
      </div>
    );
  }

  const calm = selected.severity === "INFO";
  return (
    <div className="al-wrap">
      <article className="card dk al-main" aria-live="polite">
        <div className="row ac wrap">
          <Ico icon={calm ? Info : TriangleAlert} tone={calm ? "g" : "w"} />
          <span className="f1">
            <b className="al-title">{selected.message}</b>
            <span className="sub" style={{ display: "block" }}>
              {selected.severity} · {device.device_name} · <time dateTime={selected.created_at}>{timeAgo(selected.created_at)}</time>
            </span>
          </span>
        </div>
        <FixOptions key={selected.id} device={device} alert={selected} onFix={sendFix} />
        <div className="row ac wrap" style={{ gap: "calc(4 * var(--u))" }}>
          <button type="button" className={cx("bk", "lt", showDiagnosis && "on")} onClick={toggleDiagnosis} aria-expanded={showDiagnosis}>
            {showDiagnosis ? <ChevronUp strokeWidth={2} aria-hidden="true" /> : <Sparkles strokeWidth={1.9} aria-hidden="true" />}
            {showDiagnosis ? "Hide diagnosis" : "Diagnose"}
          </button>
          <button
            type="button"
            className="bk al-close"
            aria-label="Close alert"
            onClick={close}
            disabled={closing}
            title="Mark this alert as dealt with. If the reading is still over its limit, Lectio raises it again."
          >
            <Check strokeWidth={2} aria-hidden="true" /> {closing ? "Closing…" : "Close alert"}
          </button>
        </div>
        {error && <p className="note w" role="alert">{error}</p>}
        {showDiagnosis && <DiagnosisPanel state={diagnosis[selected.id]} onRetry={() => { setShowDiagnosis(false); toggleDiagnosis(); }} />}
      </article>

      <div className="al-side">
        {others.length > 0 && (
          <article className="card gs al-list">
            <h3><Bell strokeWidth={1.9} aria-hidden="true" /> Other open alerts</h3>
            <ul>
              {others.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setSelectedId(a.id)}>
                    <b>{a.message}</b>
                    <span className="sub">{a.severity} · {timeAgo(a.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </article>
        )}
        <RecentFixes fixes={fixes} pc={device.device_name} />
      </div>
    </div>
  );
}

function RecentFixes({ fixes, pc }) {
  return (
    <article className="card al-list">
      <h3><ShieldCheck strokeWidth={1.9} aria-hidden="true" /> Recent fixes</h3>
      {fixes.length === 0 ? (
        <p className="sub">No fixes yet. When you choose one, its progress shows here.</p>
      ) : (
        <ul>
          {fixes.slice(0, 4).map((f) => (
            <li key={f.id}>
              <b>{f.title}</b>
              <span className="sub">{fixState(f, pc).text}</span>
            </li>
          ))}
        </ul>
      )}
      {fixes.length > 0 && <Chip tone="n">Undo or cancel fixes on My Devices</Chip>}
    </article>
  );
}
