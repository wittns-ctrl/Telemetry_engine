import React from "react";
import {
  Database,
  AlertTriangle,
  Cpu,
  Thermometer,
  Radio,
  Server,
  CheckCircle2,
} from "lucide-react";

export function StatsOverview({
  stats,
  alertsCount,
  activeSensorsCount,
  isWsConnected,
}) {
  const totalMetrics = stats?.total_metrics || 0;
  const tempCount = stats?.by_type?.temperature || 0;
  const cpuCount = stats?.by_type?.cpu || 0;
  const netCount = stats?.by_type?.network || 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
      {/* 1. Total Metrics Ingested */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all"></div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total Telemetry
          </span>
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Database className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-black text-white font-mono tracking-tight">
            {totalMetrics.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Thermometer className="w-3 h-3 text-amber-400" /> {tempCount}
            </span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-cyan-400" /> {cpuCount}
            </span>
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-emerald-400" /> {netCount}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Critical Breach Alerts */}
      <div
        className={`bg-slate-900/90 border rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden transition-all ${
          alertsCount > 0
            ? "border-rose-800/80 bg-rose-950/20 animate-pulse-glow"
            : "border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Critical Alerts
          </span>
          <div
            className={`p-2 rounded-lg ${
              alertsCount > 0
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div
            className={`text-2xl font-black font-mono tracking-tight ${alertsCount > 0 ? "text-rose-400" : "text-white"}`}
          >
            {alertsCount}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {alertsCount > 0
              ? "Threshold breach events detected"
              : "All telemetry parameters normal"}
          </p>
        </div>
      </div>

      {/* 3. Monitored Sensor Nodes */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Active Sensors
          </span>
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Server className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-black text-white font-mono tracking-tight">
            {activeSensorsCount || stats?.active_sensors_count || 1}
          </div>
          <p className="mt-1 text-[11px] text-slate-400 truncate">
            {stats?.recent_sensors
              ? stats.recent_sensors.slice(0, 2).join(", ")
              : "Polymorphic streams"}
          </p>
        </div>
      </div>

      {/* 4. Engine Health & Protocol */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Engine Status
          </span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-emerald-400">
              Operational
            </span>
            <span className="text-xs text-slate-500 font-mono">100%</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>WebSocket: {isWsConnected ? "Connected" : "Offline"}</span>
            <span>DB: MongoDB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
