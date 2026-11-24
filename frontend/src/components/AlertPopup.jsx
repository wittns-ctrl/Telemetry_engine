import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flame, TriangleAlert, X } from "lucide-react";
import { alertFeedUrl, fetchDevices, refreshAccessToken, requestFix } from "../services/api";
import { FixOptions } from "./fixes";

// Severities that interrupt with a pop-up. INFO alerts (such as high CPU load
// during a game) only count on the Alerts tab.
const POP_UP = new Set(["WARNING", "CRITICAL"]);
const SEEN_KEY = "lectio-popped-alerts";

function loadSeen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveSeen(seen) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* storage unavailable: the pop-up may show again after a reload */
  }
}

/**
 * Pops up the moment a PC raises a new warning or critical alert, on any page
 * of the signed-in app: what went wrong, the ways to fix it, and a choice.
 * Fed by the user's alert feed (/api/v1/ws/alert-feed). Each alert pops up
 * once per browser session; several at once queue up.
 */
export function AlertPopup({ onSeeAll }) {
  const [queue, setQueue] = useState([]);
  const [devices, setDevices] = useState({});
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const [sent, setSent] = useState(false);
  const seen = useRef(loadSeen());
  const closeRef = useRef(null);

  // Device names and details, needed by the fix options.
  useEffect(() => {
    fetchDevices()
      .then((res) => setDevices(Object.fromEntries((res?.devices || []).map((d) => [d.id, d]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ws;
    let retry;
    let disposed = false;
    let attempts = 0;
    const connect = async () => {
      if (disposed) return;
      const url = await alertFeedUrl();
      if (disposed) return;
      ws = new WebSocket(url);
      ws.onopen = () => { attempts = 0; };
      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type !== "alerts" || !Array.isArray(data.alerts)) return;
        const fresh = data.alerts.filter((a) => a.is_active !== false && POP_UP.has(a.severity) && !seen.current.has(a.id));
        if (!fresh.length) return;
        fresh.forEach((a) => seen.current.add(a.id));
        saveSeen(seen.current);
        const named = fresh.map((a) => ({ ...a, device_id: a.device_id || data.device_id, device_name: data.device_name }));
        setQueue((prev) => [...prev, ...named]);
        // A PC registered after the page loaded: fetch its details.
        if (!devicesRef.current[data.device_id]) {
          fetchDevices()
            .then((res) => setDevices(Object.fromEntries((res?.devices || []).map((d) => [d.id, d]))))
            .catch(() => {});
        }
      };
      ws.onclose = async (event) => {
        if (disposed) return;
        if (event.code === 1008) await refreshAccessToken();
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++));
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  const alert = queue[0];
  const device = alert ? devices[alert.device_id] || { id: alert.device_id, device_name: alert.device_name || "your PC" } : null;

  const dismiss = () => {
    setSent(false);
    setQueue((prev) => prev.slice(1));
  };

  const alertId = alert?.id;
  useEffect(() => {
    if (!alertId) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setSent(false);
      setQueue((prev) => prev.slice(1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [alertId]);

  if (!alert) return null;

  const critical = alert.severity === "CRITICAL";
  const Icon = critical ? Flame : TriangleAlert;
  const host = document.querySelector(".ld-frame") || document.body;
  return createPortal(
    <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="cf cf-danger ap" role="alertdialog" aria-modal="true" aria-labelledby="ap-title" aria-describedby="ap-text">
        <button type="button" className="modal-x ap-x" onClick={dismiss} aria-label="Close" ref={closeRef}>
          <X strokeWidth={2} aria-hidden="true" />
        </button>
        <span className="cf-ico" aria-hidden="true"><Icon strokeWidth={2} /></span>
        <h2 id="ap-title" className="cf-title">{critical ? `${device.device_name} needs attention` : `Check ${device.device_name}`}</h2>
        <div id="ap-text" className="cf-body">
          <p>{alert.message}</p>
          {queue.length > 1 && <p className="ap-more">{queue.length - 1} more alert{queue.length > 2 ? "s" : ""} after this one</p>}
        </div>
        {sent ? (
          <p className="ap-sent" role="status">Fix sent to {device.device_name}. Follow it on the Alerts tab.</p>
        ) : (
          <div className="ap-fixes">
            <FixOptions
              key={alert.id}
              device={device}
              alert={alert}
              confirm={false}
              onFix={async ({ fixId }) => {
                await requestFix(device.id, { fixId, alertId: alert.id });
                setSent(true);
              }}
            />
          </div>
        )}
        <div className="cf-actions">
          <button type="button" className="cf-btn cf-cancel" onClick={dismiss}>{sent ? "Done" : "Not now"}</button>
          <button type="button" className="cf-btn cf-go ap-all" onClick={() => { setSent(false); setQueue([]); onSeeAll?.(); }}>See all alerts</button>
        </div>
      </div>
    </div>,
    host,
  );
}
