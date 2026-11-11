import React, { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, MonitorSmartphone, RefreshCw, AlertTriangle, HardDrive, Zap, MemoryStick, Wifi, WifiOff, Sparkles, ChevronUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  API_BASE,
  fetchDevices,
  fetchLatestTelemetry,
  fetchDeviceAlerts,
  telemetrySocketUrl,
  refreshAccessToken,
  requestDiagnosis,
} from "../services/api";
import { DiagnosisPanel } from "./DiagnosisPanel";

const MAX_POINTS = 60;

function fmt(value, digits = 1, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function timeAgo(iso) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

const SEVERITY_STYLES = {
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
  WARNING: "bg-amber-50 text-amber-700 border-amber-200",
  INFO: "bg-sky-50 text-sky-700 border-sky-200",
};

function StatTile({ icon: Icon, label, value, sub }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wide">
        <Icon size={14} /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/**
 * Live view of the user's registered machines. Telemetry is pushed by the
 * host agent (agent/telemetry_agent.py) and streamed here over WebSocket.
 */
export function DevicesView() {
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [socketState, setSocketState] = useState("idle");
  // Diagnostic reports by alert id, and which alerts have their report open.
  const [diagnoses, setDiagnoses] = useState({});
  const [openDiagnoses, setOpenDiagnoses] = useState({});
  const selectedIdRef = useRef(null);

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const attemptsRef = useRef(0);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    setError(null);
    try {
      const data = await fetchDevices();
      const list = data?.devices || [];
      setDevices(list);
      setSelectedId((current) => current && list.some((d) => d.id === current) ? current : list[0]?.id || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const pushPoint = useCallback((snap) => {
    if (!snap) return;
    setHistory((prev) => [
      ...prev.slice(-(MAX_POINTS - 1)),
      {
        t: new Date(snap.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        cpu: snap.cpu?.utilization_percent ?? null,
        ram: snap.ram?.usage_percent ?? null,
        gpu: snap.gpu?.utilization_percent ?? null,
      },
    ]);
  }, []);

  // Load the last stored snapshot and active alerts whenever the device changes.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setSnapshot(null);
    setHistory([]);
    setAlerts([]);
    setDiagnoses({});
    setOpenDiagnoses({});
    selectedIdRef.current = selectedId;

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
  }, [selectedId, pushPoint]);

  // Live socket for the selected device.
  useEffect(() => {
    if (!selectedId) return undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setSocketState("connecting");
      const ws = new WebSocket(telemetrySocketUrl(selectedId));
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
        if (data.type === "telemetry" && data.telemetry) {
          setSnapshot(data.telemetry);
          pushPoint(data.telemetry);
        }
        if (Array.isArray(data.alerts) && data.alerts.length) {
          setAlerts((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            return [...data.alerts.filter((a) => !seen.has(a.id)), ...prev].slice(0, 50);
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
  }, [selectedId, pushPoint]);

  const loadDiagnosis = useCallback(async (alertId, deviceId) => {
    setDiagnoses((prev) => ({ ...prev, [alertId]: { status: "loading" } }));
    let next;
    try {
      next = { status: "ready", report: await requestDiagnosis(alertId, deviceId) };
    } catch (error) {
      next = { status: "error", error };
    }
    // Drop the answer if the user has switched to another device meanwhile.
    if (selectedIdRef.current === deviceId) {
      setDiagnoses((prev) => ({ ...prev, [alertId]: next }));
    }
  }, []);

  const toggleDiagnosis = (alertId) => {
    const opening = !openDiagnoses[alertId];
    setOpenDiagnoses((prev) => ({ ...prev, [alertId]: opening }));
    // Reports are kept once fetched; only ask again after a failure.
    const existing = diagnoses[alertId];
    if (opening && (!existing || existing.status === "error")) {
      loadDiagnosis(alertId, selectedId);
    }
  };

  const selected = devices.find((d) => d.id === selectedId);

  if (loadingDevices) {
    return <div className="p-6 text-slate-500">Loading devices…</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4">{error}</div>
        <button onClick={loadDevices} className="mt-4 text-sm font-medium text-ink-700">Try again</button>
      </div>
    );
  }

  if (!devices.length) {
    return (
      <div className="max-w-2xl glass rounded-2xl p-6">
        <div className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
          <MonitorSmartphone size={20} /> Connect your first machine
        </div>
        <p className="mt-2 text-slate-600 text-sm">
          Run the telemetry agent on the computer you want to monitor. It signs in once, registers the
          machine to your account, then sends hardware readings every few seconds.
        </p>
        <pre className="mt-4 bg-slate-900 text-slate-100 text-xs rounded-xl p-4 overflow-x-auto">
{`# from a copy of the telemetry_engine repo on that machine
uv sync --extra agent
uv run python -m agent.telemetry_agent --api ${API_BASE}`}
        </pre>
        <button
          onClick={loadDevices}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink-700"
        >
          <RefreshCw size={14} /> I've started the agent — refresh
        </button>
      </div>
    );
  }

  const cpu = snapshot?.cpu || {};
  const gpu = snapshot?.gpu || {};
  const ram = snapshot?.ram || {};
  const power = snapshot?.power_vrm || {};
  const storage = snapshot?.storage || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {devices.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelectedId(d.id)}
            className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
              d.id === selectedId
                ? "bg-ink-50 border-ink-200 text-ink-800 font-medium"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {d.device_name}
          </button>
        ))}
        <button onClick={loadDevices} className="ml-auto p-2 rounded-xl text-slate-500 hover:bg-slate-100" title="Refresh devices">
          <RefreshCw size={16} />
        </button>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="font-medium text-slate-800">{selected.device_name}</span>
          {selected.os_info && <span>{selected.os_info}</span>}
          <span>Last seen {timeAgo(snapshot?.timestamp || selected.last_seen)}</span>
          <span className={`inline-flex items-center gap-1 ${socketState === "live" ? "text-ink-600" : "text-slate-400"}`}>
            {socketState === "live" ? <Wifi size={14} /> : <WifiOff size={14} />}
            {socketState === "live" ? "Live" : socketState === "connecting" ? "Connecting…" : "Offline"}
          </span>
        </div>
      )}

      {!snapshot ? (
        <div className="glass rounded-2xl p-6 text-slate-500 text-sm">
          No telemetry yet. Start the agent on this machine and readings will appear here.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={Cpu} label="CPU" value={fmt(cpu.utilization_percent, 0, "%")} sub={`${fmt(cpu.package_temperature_c ?? cpu.core_temperature_c, 0, "°C")} · ${fmt(cpu.clock_speed_ghz, 2, " GHz")}`} />
            <StatTile icon={MonitorSmartphone} label="GPU" value={fmt(gpu.utilization_percent, 0, "%")} sub={`${fmt(gpu.core_temperature_c, 0, "°C")}${gpu.gpu_name ? ` · ${gpu.gpu_name}` : ""}`} />
            <StatTile icon={MemoryStick} label="Memory" value={fmt(ram.usage_percent, 0, "%")} sub={`${fmt(ram.used_gb, 1)} / ${fmt(ram.total_gb, 1, " GB")}`} />
            <StatTile icon={Zap} label="PSU 12V" value={fmt(power.psu_12v_voltage, 2, " V")} sub={`VRM ${fmt(power.vrm_temperature_c, 0, "°C")}`} />
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-medium text-slate-700 mb-2">Utilization (last {MAX_POINTS} readings)</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#94a3b8" }} minTickGap={40} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="cpu" name="CPU %" stroke="#45454c" dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="ram" name="RAM %" stroke="#6366f1" dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="gpu" name="GPU %" stroke="#f59e0b" dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {storage.length > 0 && (
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3"><HardDrive size={14} /> Storage</div>
              <div className="space-y-2">
                {storage.map((drive, i) => {
                  const total = drive.total_capacity_gb;
                  const free = drive.available_capacity_gb;
                  const usedPct = total ? Math.round(((total - (free ?? 0)) / total) * 100) : null;
                  return (
                    <div key={`${drive.device_name}-${i}`} className="text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>{drive.device_name || `Drive ${i + 1}`}</span>
                        <span className="tabular-nums">{fmt(free, 0)} GB free of {fmt(total, 0, " GB")}{drive.smart_health_percent != null ? ` · health ${drive.smart_health_percent}%` : ""}</span>
                      </div>
                      {usedPct !== null && (
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-ink-500" style={{ width: `${usedPct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3"><AlertTriangle size={14} /> Active alerts</div>
        {alerts.length === 0 ? (
          <div className="text-sm text-slate-500">No active alerts for this device.</div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className={`border rounded-xl px-3 py-2 text-sm ${SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.INFO}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{a.message}</div>
                    <div className="text-xs opacity-80">{a.severity} · {a.rule_name} · {new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => toggleDiagnosis(a.id)}
                    aria-expanded={!!openDiagnoses[a.id]}
                    className="flex-none inline-flex items-center gap-1 rounded-lg bg-white/80 border border-current/20 px-2 py-1 text-xs font-medium hover:bg-white"
                  >
                    {openDiagnoses[a.id] ? <ChevronUp size={12} /> : <Sparkles size={12} />}
                    {openDiagnoses[a.id] ? "Hide diagnosis" : "Diagnose"}
                  </button>
                </div>
                {openDiagnoses[a.id] && (
                  <DiagnosisPanel state={diagnoses[a.id]} onRetry={() => loadDiagnosis(a.id, selectedId)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
