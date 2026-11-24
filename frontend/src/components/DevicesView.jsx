import React, { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Plus, RefreshCw, TriangleAlert, Info, HardDrive, ChartLine, Bell, Sparkles, ChevronUp, Download, MapPin, Wrench, Check, Trash2 } from "lucide-react";
import {
  AGENT_DOWNLOAD_URL,
  fetchAgentDownloadInfo,
  closeAlert,
  deleteDevice,
  fetchDevices,
  fetchLatestTelemetry,
  fetchDeviceAlerts,
  fetchDeviceCountries,
  updateDevice,
  telemetrySocketUrl,
  refreshAccessToken,
  requestDiagnosis,
  fetchFixHistory,
  requestFix,
  cancelFix,
  undoFix,
} from "../services/api";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { Card, Head, Chip, Ico, Empty, LineGraph, Tabs } from "./ui";
import { ConfirmDialog } from "./ConfirmDialog";
import { FixHistory, FixOptions, FixStatusLine } from "./fixes";
import { cx, fmt, timeAgo } from "./format";

const MAX_POINTS = 60;
// Three colours far apart in lightness, so the lines stay distinct. The reading
// tiles above the graph use the same colours: CPU black, GPU grey, Memory green.
const LINES = [
  { key: "ram", name: "RAM", colour: "#1c7a2e" },
  { key: "cpu", name: "CPU", colour: "#0e0e10" },
  { key: "gpu", name: "GPU", colour: "#8e8e96", tagText: "#0e0e10", tagBg: "#d9d9dc" },
];

const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const pointOf = (snap) => ({
  t: timeLabel(snap.timestamp),
  cpu: snap.cpu?.utilization_percent ?? null,
  ram: snap.ram?.usage_percent ?? null,
  gpu: snap.gpu?.utilization_percent ?? null,
});

/** A device counts as online when it reported within the last two minutes. */
const isOnline = (device) => Boolean(device.last_seen) && Date.now() - new Date(device.last_seen).getTime() < 120000;

/** How to connect a PC: download the agent and run it. Shown when there are no devices or on "Add a device". */
function AddDevice({ onRefresh }) {
  // null while checking; false when this server has no agent to hand out yet.
  const [download, setDownload] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchAgentDownloadInfo()
      .then((info) => { if (!cancelled) setDownload(info?.available ? info : false); })
      .catch(() => { if (!cancelled) setDownload(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="pad col dk">
      <Head icon={Download} title="Connect a PC" />
      <ol className="txt steps">
        <li>On the Windows PC you want to watch, download the Lectio agent{download?.size_mb ? ` (${download.size_mb} MB)` : ""}.</li>
        <li>
          Double-click <b>lectio-agent.exe</b> and choose <b>Yes</b> when Windows asks for permission. If Windows says it
          protected your PC, choose <b>More info</b>, then <b>Run anyway</b>.
        </li>
        <li>Sign in with your Lectio email and password. Your password is only used this once and isn&apos;t saved.</li>
        <li>That&apos;s it: Lectio now runs in the background and starts with Windows. You can close the window.</li>
      </ol>
      <div className="row ac wrap" style={{ gap: "calc(4 * var(--u))" }}>
        {download === false ? (
          <p className="note w" role="status">The Windows agent isn&apos;t available on this server yet. Please try again later.</p>
        ) : (
          <a className="bk lt" href={AGENT_DOWNLOAD_URL}>
            <Download strokeWidth={1.9} aria-hidden="true" /> Download for Windows
          </a>
        )}
        <button type="button" className="bk gr" onClick={onRefresh}>
          <RefreshCw strokeWidth={1.9} aria-hidden="true" /> I&apos;ve started the agent, refresh
        </button>
      </div>
    </Card>
  );
}

// The country names the map can draw, loaded once.
let countriesPromise;
function loadCountries() {
  if (!countriesPromise) {
    countriesPromise = fetchDeviceCountries().catch((err) => {
      countriesPromise = null; // let the next mount try again
      throw err;
    });
  }
  return countriesPromise;
}

/** Where the device is, which places it on the dashboard map. */
function LocationCard({ device, onSaved }) {
  const [countries, setCountries] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(device.country || "");
  const [status, setStatus] = useState({ state: "idle" });

  useEffect(() => {
    let cancelled = false;
    loadCountries()
      .then((list) => !cancelled && setCountries(list))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const saved = device.country || "";
  const changed = draft !== saved;
  const saving = status.state === "saving";

  const save = async () => {
    if (!changed || saving) return;
    setStatus({ state: "saving" });
    const country = draft || null;
    try {
      const next = await updateDevice(device.id, { country });
      onSaved(next);
      setStatus({ state: "done", text: country ? `Saved. ${device.device_name} now shows in ${country} on the map.` : "Removed from the map." });
    } catch (err) {
      setStatus({ state: "error", text: err.message });
    }
  };

  return (
    <Card className="pad col dk">
      <Head icon={MapPin} title="Location">
        <span className="sub">Shown on the dashboard map</span>
      </Head>
      {loadError ? (
        <p className="note w" role="alert">Couldn't load the country list. {loadError}</p>
      ) : (
        <form
          className="row ac"
          style={{ gap: "calc(5 * var(--u))" }}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <select
            className="inp f1"
            aria-label={`Country ${device.device_name} is in`}
            value={draft}
            disabled={!countries || saving}
            onChange={(e) => {
              setDraft(e.target.value);
              setStatus({ state: "idle" });
            }}
          >
            <option value="">{countries ? "Not on the map" : "Loading countries…"}</option>
            {/* Keep a stored country selectable even before the list arrives. */}
            {!countries && saved && <option value={saved}>{saved}</option>}
            {countries?.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" className="bk lt" disabled={!changed || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {status.state === "done" && <p className="note" role="status">{status.text}</p>}
      {status.state === "error" && <p className="note w" role="alert">{status.text}</p>}
    </Card>
  );
}

/**
 * The user's registered machines: the list on the left, the selected one's
 * live readings on the right. Telemetry is pushed by the host agent
 * (agent/telemetry_agent.py) and streamed here over WebSocket.
 */
export function DevicesView() {
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [socketState, setSocketState] = useState("idle");
  // Diagnostic reports by alert id, and which alerts have their report open.
  const [diagnoses, setDiagnoses] = useState({});
  const [openDiagnoses, setOpenDiagnoses] = useState({});
  const selectedIdRef = useRef(null);

  // Fixes: this PC's history (the Fixes tab), which alerts have their fix
  // options open, and the fix being undone or cancelled.
  const [view, setView] = useState("readings");
  const [fixes, setFixes] = useState([]);
  const [fixesLoading, setFixesLoading] = useState(false);
  const [fixesError, setFixesError] = useState(null);
  const [openFixes, setOpenFixes] = useState({});
  const [busyFixId, setBusyFixId] = useState(null);
  const [fixActionError, setFixActionError] = useState(null);

  // Closing alerts by hand, and removing a device (asked first in a dialog).
  const [closingId, setClosingId] = useState(null);
  const [alertError, setAlertError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const attemptsRef = useRef(0);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    setError(null);
    try {
      const list = (await fetchDevices())?.devices || [];
      setDevices(list);
      setSelectedId((current) => (current && list.some((d) => d.id === current) ? current : list[0]?.id || null));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Add or replace one fix (from the API or the live socket), newest first.
  const upsertFix = useCallback((fix) => {
    if (!fix || fix.device_id !== selectedIdRef.current) return;
    setFixes((prev) =>
      [fix, ...prev.filter((f) => f.id !== fix.id)].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    );
  }, []);

  const loadFixes = useCallback(async (deviceId) => {
    setFixesLoading(true);
    try {
      const list = await fetchFixHistory(deviceId);
      if (selectedIdRef.current === deviceId) {
        setFixes(list);
        setFixesError(null);
      }
    } catch (err) {
      if (selectedIdRef.current === deviceId) setFixesError(err.message);
    } finally {
      setFixesLoading(false);
    }
  }, []);

  const pushPoint = useCallback((snap) => {
    if (!snap) return;
    setHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), pointOf(snap)]);
  }, []);

  // Load the last stored snapshot and active alerts whenever the device changes.
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    setSnapshot(null);
    setHistory([]);
    setAlerts([]);
    setDiagnoses({});
    setOpenDiagnoses({});
    setFixes([]);
    setOpenFixes({});
    setFixesError(null);
    setFixActionError(null);
    selectedIdRef.current = selectedId;
    loadFixes(selectedId);

    fetchLatestTelemetry(selectedId)
      .then((snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        pushPoint(snap);
      })
      .catch(() => {
        /* 404 until the agent sends its first snapshot */
      });

    fetchDeviceAlerts(selectedId, { activeOnly: true })
      .then((data) => {
        if (!cancelled) setAlerts(data?.alerts || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedId, pushPoint, loadFixes]);

  // Live socket for the selected device.
  useEffect(() => {
    if (!selectedId) return undefined;
    let disposed = false;

    const connect = async () => {
      if (disposed) return;
      setSocketState("connecting");
      const url = await telemetrySocketUrl(selectedId);
      if (disposed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setSocketState("live");
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === "fix" && data.fix) {
          upsertFix(data.fix);
          return;
        }
        if (data.type === "telemetry" && data.telemetry) {
          setSnapshot(data.telemetry);
          pushPoint(data.telemetry);
        }
        if (Array.isArray(data.alerts) && data.alerts.length) {
          setAlerts((prev) => {
            // The socket sends new, updated and just-closed alerts alike.
            const incoming = new Map(data.alerts.map((a) => [a.id, a]));
            const kept = prev.map((a) => (incoming.has(a.id) ? { ...a, ...incoming.get(a.id) } : a));
            const added = data.alerts.filter((a) => !prev.some((p) => p.id === a.id));
            return [...added, ...kept].filter((a) => a.is_active !== false).slice(0, 50);
          });
        }
      };

      ws.onclose = async (event) => {
        if (disposed) return;
        setSocketState("offline");
        // 1008 = policy violation: usually an expired access token.
        if (event.code === 1008) {
          await refreshAccessToken();
        }
        const delay = Math.min(30000, 1000 * 2 ** attemptsRef.current);
        attemptsRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [selectedId, pushPoint, upsertFix]);

  const loadDiagnosis = useCallback(async (alertId, deviceId) => {
    setDiagnoses((prev) => ({ ...prev, [alertId]: { status: "loading" } }));
    let next;
    try {
      next = { status: "ready", report: await requestDiagnosis(alertId, deviceId) };
    } catch (err) {
      next = { status: "error", error: err };
    }
    // Drop the answer if the user has switched to another device meanwhile.
    if (selectedIdRef.current === deviceId) {
      setDiagnoses((prev) => ({ ...prev, [alertId]: next }));
    }
  }, []);

  // While a fix is on its way, check every few seconds in case a live update is missed.
  const pendingFix = fixes.some((f) => f.status === "queued" || f.status === "running");
  useEffect(() => {
    if (!pendingFix || !selectedId) return undefined;
    const timer = setInterval(() => loadFixes(selectedId), 5000);
    return () => clearInterval(timer);
  }, [pendingFix, selectedId, loadFixes]);

  const sendFix = async (alert, { fixId }) => {
    setFixActionError(null);
    const fix = await requestFix(selectedId, { fixId, alertId: alert.id });
    upsertFix(fix);
    setOpenFixes((prev) => ({ ...prev, [alert.id]: false }));
  };

  const fixAction = async (fix, action) => {
    setBusyFixId(fix.id);
    setFixActionError(null);
    try {
      upsertFix(action === "undo" ? await undoFix(fix.id) : await cancelFix(fix.id));
    } catch (err) {
      setFixActionError(err.message);
    } finally {
      setBusyFixId(null);
    }
  };
  const undo = (fix) => fixAction(fix, "undo");
  const cancel = (fix) => fixAction(fix, "cancel");

  const toggleDiagnosis = (alertId) => {
    const opening = !openDiagnoses[alertId];
    setOpenDiagnoses((prev) => ({ ...prev, [alertId]: opening }));
    // Reports are kept once fetched; only ask again after a failure.
    const existing = diagnoses[alertId];
    if (opening && (!existing || existing.status === "error")) {
      loadDiagnosis(alertId, selectedId);
    }
  };

  const close = async (alertId) => {
    setClosingId(alertId);
    setAlertError(null);
    try {
      await closeAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      setAlertError(err.message);
    } finally {
      setClosingId(null);
    }
  };

  // Runs from the dialog; a failure shows there and the PC stays.
  const removeSelected = async () => {
    await deleteDevice(selectedId);
    const rest = devices.filter((d) => d.id !== selectedId);
    setConfirmRemove(false);
    setSnapshot(null);
    setHistory([]);
    setAlerts([]);
    setDevices(rest);
    setSelectedId(rest[0]?.id || null);
  };

  const selected = devices.find((d) => d.id === selectedId);

  if (loadingDevices && !devices.length) {
    return <div className="page"><Card className="pad f1 col"><Empty title="Loading devices…" /></Card></div>;
  }

  if (error) {
    return (
      <div className="page">
        <Card className="pad col">
          <p className="note w" role="alert">{error}</p>
          <div><button type="button" className="bk" onClick={loadDevices}>Try again</button></div>
        </Card>
      </div>
    );
  }

  if (!devices.length) {
    return <div className="page"><AddDevice onRefresh={loadDevices} /></div>;
  }

  const cpu = snapshot?.cpu || {};
  const gpu = snapshot?.gpu || {};
  const ram = snapshot?.ram || {};
  const power = snapshot?.power_vrm || {};
  const storage = snapshot?.storage || [];
  const live = socketState === "live";

  return (
    <div className="page">
      <div className="row stack-sm" style={{ flex: 1 }}>
        <div className="col dev-list">
          {devices.map((d) => {
            const on = d.id === selectedId;
            const online = on ? live || isOnline(d) : isOnline(d);
            return (
              <button key={d.id} type="button" className={cx("dev", on && "on")} aria-pressed={on} onClick={() => setSelectedId(d.id)}>
                <span className="row ac" style={{ gap: "calc(6 * var(--u))" }}>
                  <Ico icon={Monitor} tone={on ? "d" : undefined} />
                  <span className="f1">
                    <b className="t7 cut">{d.device_name}</b>
                    <span className="sub cut" style={{ display: "block" }}>{d.os_info || "Unknown system"}</span>
                  </span>
                </span>
                <span className="row ac" style={{ marginTop: "calc(8 * var(--u))" }}>
                  <Chip tone={online ? undefined : "n"}>{online ? "Online" : "Offline"}</Chip>
                  <span className="sub r">{timeAgo(on && snapshot ? snapshot.timestamp : d.last_seen)}</span>
                </span>
              </button>
            );
          })}
          <button type="button" className="dash" aria-expanded={showAdd} onClick={() => setShowAdd((v) => !v)}>
            <Plus strokeWidth={2} aria-hidden="true" />
            Add a device
          </button>
        </div>

        <div className="col f1">
          {selected && (
            <div className="row ac wrap">
              <b className="t9">{selected.device_name}</b>
              <Chip tone={live ? undefined : "n"}>{live ? "Live" : socketState === "connecting" ? "Connecting…" : "Offline"}</Chip>
              <span className="sub">
                {selected.os_info ? `${selected.os_info} · ` : ""}
                {live && snapshot ? "reporting now" : `last seen ${timeAgo(snapshot?.timestamp || selected.last_seen)}`}
              </span>
              <span className="row ac r" style={{ gap: "calc(3 * var(--u))" }}>
                <button type="button" className="vd" onClick={loadDevices} disabled={loadingDevices}>Refresh</button>
                <button type="button" className="vd" onClick={() => setConfirmRemove(true)}>
                  Remove
                </button>
              </span>
            </div>
          )}

          {selected && (
            <ConfirmDialog
              open={confirmRemove}
              tone="danger"
              icon={Trash2}
              title={`Remove ${selected.device_name}?`}
              confirmLabel="Remove PC"
              busyLabel="Removing…"
              onConfirm={removeSelected}
              onCancel={() => setConfirmRemove(false)}
            >
              <p>This can&apos;t be undone. Lectio deletes:</p>
              <ul className="cf-list">
                <li>All of this PC&apos;s readings</li>
                <li>Its alerts and fix history</li>
              </ul>
              <p>If the agent is still running there, Lectio stops accepting it. To add the PC again, run the agent and sign in.</p>
            </ConfirmDialog>
          )}

          {selected && (
            <Tabs
              label="Device view"
              value={view}
              onChange={setView}
              items={[
                { id: "readings", label: "Readings", icon: ChartLine },
                { id: "fixes", label: "Fixes", icon: Wrench, count: fixes.length || undefined },
              ]}
            />
          )}
          {fixActionError && <p className="note w" role="alert">{fixActionError}</p>}

          {showAdd && <AddDevice onRefresh={loadDevices} />}

          {view === "fixes" && selected ? (
            <FixHistory
              fixes={fixes}
              pc={selected.device_name}
              onUndo={undo}
              onCancel={cancel}
              busyId={busyFixId}
              loading={fixesLoading}
              error={fixesError}
            />
          ) : (
          <>
          {!snapshot ? (
            <Card className="pad col">
              <Empty title="No telemetry yet">
                <span>Start the agent on this machine and its readings will appear here.</span>
              </Empty>
            </Card>
          ) : (
            <>
              <div className="g4" style={{ gap: "calc(6 * var(--u))" }}>
                <div className="card mini dk"><span>CPU</span><b>{fmt(cpu.utilization_percent, 0, "%")}</b><small>{fmt(cpu.package_temperature_c ?? cpu.core_temperature_c, 0, "°C")} · {fmt(cpu.clock_speed_ghz, 2, " GHz")}</small></div>
                <div className="card mini gy"><span>GPU</span><b>{fmt(gpu.utilization_percent, 0, "%")}</b><small className="cut">{fmt(gpu.core_temperature_c, 0, "°C")}{gpu.gpu_name ? ` · ${gpu.gpu_name}` : ""}</small></div>
                <div className="card mini gd"><span>Memory</span><b>{fmt(ram.usage_percent, 0, "%")}</b><small>{fmt(ram.used_gb, 1)} / {fmt(ram.total_gb, 1, " GB")}</small></div>
                <div className="card mini"><span>PSU 12V</span><b>{fmt(power.psu_12v_voltage, 2, " V")}</b><small>VRM {fmt(power.vrm_temperature_c, 0, "°C")}</small></div>
              </div>

              <Card className="chart" style={{ flex: 1, minHeight: "calc(104 * var(--u))" }}>
                <Head icon={ChartLine} title="Live readings">
                  <span className="sub">Last {history.length} readings</span>
                  {live && <Chip>Live</Chip>}
                </Head>
                <div className="ch-bar">
                  <div className="tabs" aria-hidden="true">
                    {LINES.map((l) => <span key={l.key}><i className="swatch" style={{ background: l.colour }} />{l.name} %</span>)}
                  </div>
                </div>
                <LineGraph
                  endTags
                  series={LINES.map((l) => ({ name: l.name, colour: l.colour, tagText: l.tagText, tagBg: l.tagBg, values: history.map((p) => p[l.key]) }))}
                  labels={history.map((p) => p.t)}
                  unit="%"
                  summary={`CPU, GPU and RAM use over the last ${history.length} readings`}
                />
              </Card>
            </>
          )}

          {selected && (
            <LocationCard
              key={selected.id}
              device={selected}
              onSaved={(next) => setDevices((list) => list.map((d) => (d.id === next.id ? { ...d, ...next } : d)))}
            />
          )}

          <div className="row stack-sm">
            {storage.length > 0 && (
              <Card className="pad col f1">
                <Head icon={HardDrive} title="Storage" />
                {storage.map((drive, i) => {
                  const total = drive.total_capacity_gb;
                  const free = drive.available_capacity_gb;
                  const usedPct = total ? Math.round(((total - (free ?? 0)) / total) * 100) : null;
                  return (
                    <div key={`${drive.device_name}-${i}`}>
                      <div className="row ac" style={{ marginBottom: "calc(3 * var(--u))" }}>
                        <span className="cut f1" style={{ fontWeight: 500 }}>{drive.device_name || `Drive ${i + 1}`}</span>
                        {usedPct !== null && <span className="sub">{usedPct}% used</span>}
                      </div>
                      {usedPct !== null && (
                        <div className={cx("bar", usedPct >= 90 && "w")} aria-hidden="true"><i style={{ width: `${usedPct}%` }} /></div>
                      )}
                      <span className="sub" style={{ display: "block", marginTop: "calc(2.5 * var(--u))" }}>
                        {fmt(free, 0)} GB free of {fmt(total, 0, " GB")}
                        {drive.smart_health_percent != null ? ` · health ${drive.smart_health_percent}%` : ""}
                      </span>
                    </div>
                  );
                })}
              </Card>
            )}

            <Card className="pad" style={{ flex: 1.5, minWidth: 0 }}>
              <Head icon={Bell} title="Active alerts">
                {alerts.length > 0 && <Chip tone="w">{alerts.length} open</Chip>}
              </Head>
              {alertError && <p className="note w" role="alert" style={{ marginTop: "calc(3 * var(--u))" }}>{alertError}</p>}
              {alerts.length === 0 ? (
                <p className="txt" style={{ marginTop: "calc(5 * var(--u))" }}>No active alerts for this device.</p>
              ) : (
                <ul style={{ listStyle: "none", marginTop: "calc(3 * var(--u))" }}>
                  {alerts.map((a) => {
                    const open = !!openDiagnoses[a.id];
                    const fixOpen = !!openFixes[a.id];
                    const latestFix = fixes.find((f) => f.alert_id === a.id && !f.is_undo);
                    const calm = a.severity === "INFO";
                    return (
                      <li key={a.id} className="alert">
                        <div className="row ac wrap">
                          <Ico icon={calm ? Info : TriangleAlert} tone={calm ? "g" : "w"} />
                          <span className="f1" style={{ fontWeight: 500 }}>
                            {a.message}
                            <span className="sub" style={{ display: "block", marginTop: "calc(1.5 * var(--u))" }}>
                              {a.severity} · {a.rule_name} · <time dateTime={a.created_at} title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</time>
                            </span>
                          </span>
                          <span className="row ac" style={{ gap: "calc(4 * var(--u))" }}>
                            <button type="button" className={cx("bk", fixOpen ? "ol" : "gr")} onClick={() => setOpenFixes((prev) => ({ ...prev, [a.id]: !prev[a.id] }))} aria-expanded={fixOpen}>
                              {fixOpen ? <ChevronUp strokeWidth={2} aria-hidden="true" /> : <Wrench strokeWidth={1.9} aria-hidden="true" />}
                              {fixOpen ? "Hide fixes" : "Fix it"}
                            </button>
                            <button type="button" className={cx("bk", open && "ol")} onClick={() => toggleDiagnosis(a.id)} aria-expanded={open}>
                              {open ? <ChevronUp strokeWidth={2} aria-hidden="true" /> : <Sparkles strokeWidth={1.9} aria-hidden="true" />}
                              {open ? "Hide diagnosis" : "Diagnose"}
                            </button>
                            <button
                              type="button"
                              className="bk ol"
                              onClick={() => close(a.id)}
                              disabled={closingId === a.id}
                              title="Mark this alert as dealt with. If the reading is still over its limit, Lectio raises it again."
                            >
                              <Check strokeWidth={2} aria-hidden="true" />
                              {closingId === a.id ? "Closing…" : "Close"}
                            </button>
                          </span>
                        </div>
                        {latestFix && !fixOpen && (
                          <FixStatusLine fix={latestFix} pc={selected?.device_name} onUndo={undo} onCancel={cancel} busy={busyFixId === latestFix.id} />
                        )}
                        {fixOpen && selected && <FixOptions device={selected} alert={a} onFix={(choice) => sendFix(a, choice)} />}
                        {open && <DiagnosisPanel state={diagnoses[a.id]} onRetry={() => loadDiagnosis(a.id, selectedId)} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
