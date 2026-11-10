import React from "react";
import {
  ArrowUpRight,
  Plus,
  TrendingUp,
  AlertTriangle,
  Radio,
  Thermometer,
  Cpu,
} from "lucide-react";

const GAUGE_ARC_LENGTH = Math.PI * 40;

const TYPE_ROWS = [
  { key: "temperature", label: "Temperature", color: "bg-amber-500" },
  { key: "cpu", label: "CPU", color: "bg-cyan-500" },
  { key: "network", label: "Network", color: "bg-ink-800" },
];

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function DonezoDashboard({
  stats,
  thresholds,
  alerts = [],
  liveMetrics = [],
  isSimulating = false,
  onIngestClick,
  onSimulateClick,
  onViewAlerts,
}) {
  const totalMetrics = stats?.total_metrics ?? 0;
  const byType = {
    temperature: stats?.by_type?.temperature ?? 0,
    cpu: stats?.by_type?.cpu ?? 0,
    network: stats?.by_type?.network ?? 0,
  };
  const sensors = stats?.recent_sensors ?? [];

  const tempLimit = thresholds?.temperature?.max;
  const cpuLimit = thresholds?.cpu?.max;
  const netLimit = thresholds?.network?.max;

  // Share of the readings received live in this session that stayed within limits.
  const liveTotal = liveMetrics.length;
  const liveSafe = liveMetrics.filter((m) => !m.alert_triggered).length;
  const safePercent = liveTotal ? Math.round((liveSafe / liveTotal) * 100) : null;

  const recentAlerts = alerts.slice(0, 5);

  return (
    <div className="space-y-6 font-sans dash-in">
      {/* Title & Top Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Telemetry Dashboard
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Monitor, ingest, and analyze real-time telemetry streams and sensor alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onIngestClick}
            className="bg-[#1c1c1f] hover:bg-[#0e0e10] text-white font-bold text-xs px-5 py-2.5 rounded-full flex items-center gap-2 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Ingest Metric</span>
          </button>

          <button
            type="button"
            onClick={onSimulateClick}
            className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs px-5 py-2.5 rounded-full shadow-2xs transition-colors"
          >
            <span>{isSimulating ? "Stop Simulation" : "Simulate Stream"}</span>
          </button>
        </div>
      </div>

      {/* TOP ROW: 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-dark text-white rounded-3xl p-5 relative overflow-hidden flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/75">
              Total Metrics Ingested
            </span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black tracking-tight">
              {totalMetrics}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium bg-white/10 px-2.5 py-0.5 rounded-full border border-white/15">
              <TrendingUp className="w-3 h-3 text-accent-400" />
              <span>Stored readings</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Temperature Readings
            </span>
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 border border-amber-100">
              <Thermometer className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {byType.temperature}
            </div>
            {tempLimit != null && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                <span>Limit: {tempLimit}°C</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              CPU Load Readings
            </span>
            <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-700 border border-cyan-100">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {byType.cpu}
            </div>
            {cpuLimit != null && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-cyan-800 bg-cyan-50 px-2.5 py-0.5 rounded-full border border-cyan-200">
                <span>Limit: {cpuLimit}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Network Readings
            </span>
            <div className="w-8 h-8 rounded-full bg-ink-50 flex items-center justify-center text-ink-700 border border-ink-100">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {byType.network}
            </div>
            {netLimit != null && (
              <div className="mt-2 text-[10px] font-bold text-ink-800 bg-ink-50 px-2.5 py-0.5 rounded-full border border-ink-200 inline-block">
                Limit: {netLimit} MB/s
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE ROW: readings by type, latest alert, monitored sensors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 glass rounded-3xl p-5 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            Readings by Type
          </h3>

          {totalMetrics === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              No readings stored yet. Ingest a metric or connect a device to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {TYPE_ROWS.map((row) => {
                const count = byType[row.key];
                const percent = (count / totalMetrics) * 100;
                return (
                  <div key={row.key}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-700">{row.label}</span>
                      <span className="font-mono text-slate-500">
                        {count} · {percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${row.color}`}
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 glass rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Latest Alert
            </h3>
            <div className="text-sm font-black text-slate-900 leading-snug break-words">
              {alerts.length > 0
                ? `${alerts[0].severity || "ALERT"}: ${alerts[0].sensor_id || "unknown sensor"}`
                : "No alerts this session"}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {alerts.length > 0
                ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"} received since you opened the app`
                : "Alerts appear here as soon as a reading breaches its limit."}
            </p>
          </div>

          <button
            type="button"
            onClick={onViewAlerts}
            className="w-full bg-[#1c1c1f] hover:bg-[#0e0e10] text-white font-bold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-colors mt-6"
          >
            <AlertTriangle className="w-4 h-4 text-amber-300" />
            <span>View Alerts Stream</span>
          </button>
        </div>

        <div className="lg:col-span-4 glass rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Recently Active Sensors</h3>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
              {sensors.length}
            </span>
          </div>

          {sensors.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No sensors have reported yet.
            </p>
          ) : (
            <div className="space-y-3">
              {sensors.slice(0, 6).map((name) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-accent-400 ring-1 ring-ink-900/25 shrink-0"></div>
                  <div className="text-xs font-bold text-slate-800 font-mono truncate">{name}</div>
                </div>
              ))}
              {sensors.length > 6 && (
                <div className="text-[10px] text-slate-400">+{sensors.length - 6} more</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ROW: recent alerts & live safety gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 glass rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Recent Alerts</h3>
            <button
              type="button"
              onClick={onViewAlerts}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
            >
              View all
            </button>
          </div>

          {recentAlerts.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No alerts received this session.
            </p>
          ) : (
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 font-mono truncate">
                        {alert.sensor_id || "unknown sensor"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {[alert.metric_type, alert.value != null ? `value ${alert.value}` : null, formatTime(alert.receivedAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                  {alert.severity && (
                    <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full shrink-0 bg-rose-100 text-rose-800 border border-rose-200 uppercase">
                      {alert.severity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 glass rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <h3 className="text-sm font-bold text-slate-900 mb-2">
            Live Safety Gauge
          </h3>

          <div className="flex flex-col items-center justify-center my-2 relative">
            <svg className="w-36 h-20" viewBox="0 0 100 57" role="img" aria-label={
              safePercent == null ? "No live readings yet" : `${safePercent}% of live readings within limits`
            }>
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="14"
                strokeLinecap="round"
              />
              {safePercent > 0 && (
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="#0e0e10"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${(safePercent / 100) * GAUGE_ARC_LENGTH} ${GAUGE_ARC_LENGTH}`}
                />
              )}
            </svg>
            <div className="text-center mt-[-10px]">
              <div className="text-2xl font-black text-slate-900">
                {safePercent == null ? "—" : `${safePercent}%`}
              </div>
              <div className="text-[10px] font-bold text-slate-400">
                {safePercent == null ? "No live readings yet" : "Within limits"}
              </div>
            </div>
          </div>

          <div className="text-[10px] font-bold text-slate-500 pt-3 border-t border-slate-100 text-center">
            {liveTotal
              ? `${liveSafe} of the last ${liveTotal} live readings stayed within limits`
              : "Fills in as readings arrive while this page is open"}
          </div>
        </div>
      </div>
    </div>
  );
}
