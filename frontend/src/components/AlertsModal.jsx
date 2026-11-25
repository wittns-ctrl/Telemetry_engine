import React, { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { fetchDevices, fetchOpenAlerts, requestDiagnosis, requestFix } from "../services/api";
import { alertWords, sortAlerts } from "./alertWords";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { FixOptions } from "./fixes";
import { timeAgo } from "./format";
import { Modal } from "./ui";

/**
 * The bell's window (approved option B), in two steps: every open alert on
 * the user's PCs in plain words, each with "How to fix"; that turns the
 * window into the alert's fix options, with a back arrow and "Why is this
 * happening?" (the AI diagnosis).
 */
export function AlertsModal({ onClose }) {
  const [alerts, setAlerts] = useState(null);
  const [devices, setDevices] = useState({});
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [sent, setSent] = useState(null);
  const [diagnosis, setDiagnosis] = useState({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchOpenAlerts(), fetchDevices().catch(() => null)])
      .then(([list, res]) => {
        if (cancelled) return;
        setAlerts(sortAlerts(list));
        setDevices(Object.fromEntries((res?.devices || []).map((d) => [d.id, d])));
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, []);

  const deviceOf = (a) => devices[a.device_id] || { id: a.device_id, device_name: "Your PC" };
  const open = alerts?.find((a) => a.id === openId) || null;

  const back = () => { setOpenId(null); setSent(null); };

  const diagnose = async (a) => {
    setDiagnosis((prev) => ({ ...prev, [a.id]: { status: "loading" } }));
    try {
      const report = await requestDiagnosis(a.id, a.device_id);
      setDiagnosis((prev) => ({ ...prev, [a.id]: { status: "ready", report } }));
    } catch (err) {
      setDiagnosis((prev) => ({ ...prev, [a.id]: { status: "error", error: err } }));
    }
  };

  // Step 2: one alert and the ways to fix it.
  if (open) {
    const device = deviceOf(open);
    const words = alertWords(open, device.device_name);
    return (
      <Modal
        onClose={onClose}
        title={(
          <span className="am-head">
            {/* The window stays open between steps, so move focus here by hand. */}
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <button type="button" className="modal-x am-back" onClick={back} aria-label="Back to all alerts" autoFocus>
              <ArrowLeft strokeWidth={2} aria-hidden="true" />
            </button>
            {words.title}
          </span>
        )}
      >
        <p className="txt">{words.detail} · {timeAgo(open.created_at)}</p>
        {sent === open.id ? (
          <p className="ap-sent" role="status">Fix sent to {device.device_name}. You can follow it on My Devices.</p>
        ) : (
          <FixOptions
            key={open.id}
            device={device}
            alert={open}
            confirm={false}
            onFix={async ({ fixId }) => {
              await requestFix(device.id, { fixId, alertId: open.id });
              setSent(open.id);
            }}
          />
        )}
        {diagnosis[open.id] ? (
          <DiagnosisPanel state={diagnosis[open.id]} onRetry={() => diagnose(open)} />
        ) : (
          <button type="button" className="bk ol am-why" onClick={() => diagnose(open)}>
            <Sparkles strokeWidth={1.9} aria-hidden="true" /> Why is this happening?
          </button>
        )}
      </Modal>
    );
  }

  // Step 1: the list.
  const count = alerts?.length || 0;
  return (
    <Modal title="Alerts" onClose={onClose}>
      {error && <p className="note w" role="alert">{error}</p>}
      {!error && !alerts && <p className="sub" role="status">Loading your alerts…</p>}
      {alerts && count === 0 && (
        <div className="am-calm">
          <ShieldCheck strokeWidth={1.9} aria-hidden="true" />
          <p className="txt">Nothing needs a look right now. Lectio will tell you the moment something goes wrong.</p>
        </div>
      )}
      {count > 0 && (
        <>
          <p className="sub">{count === 1 ? "1 problem needs a look" : `${count} problems need a look`}</p>
          <ul className="am-list">
            {alerts.map((a) => {
              const words = alertWords(a, deviceOf(a).device_name);
              return (
                <li key={a.id} className="am-row">
                  <span className={`am-dot ${a.severity === "INFO" ? "info" : ""}`} aria-hidden="true" />
                  <div className="am-text">
                    <b>{words.title}</b>
                    <span className="sub">
                      <span className="sr-only">{a.severity === "CRITICAL" ? "Critical. " : a.severity === "WARNING" ? "Warning. " : ""}</span>
                      {words.detail} · {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <button type="button" className="bk" onClick={() => setOpenId(a.id)}>How to fix</button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
