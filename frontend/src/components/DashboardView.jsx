import React from "react";
import { Database, AlertTriangle, Server, CheckCircle2 } from "lucide-react";
import { LiveCharts } from "./LiveCharts";

export function DashboardView({ stats, alertsCount, liveMetrics, thresholds }) {
  const totalMetrics = stats?.total_metrics || 0;
  const tempCount = stats?.by_type?.temperature || 0;
  const cpuCount = stats?.by_type?.cpu || 0;
  const netCount = stats?.by_type?.network || 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
          WORKSPACE / DASHBOARD
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
          Executive Telemetry Overview
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Real-time metrics stream, threshold evaluations, and active node
          status.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ingested */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Telemetry
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-slate-900 font-mono">
              {totalMetrics.toLocaleString()}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 font-mono">
              <span>°C: {tempCount}</span>
              <span>CPU: {cpuCount}</span>
              <span>Net: {netCount}</span>
            </div>
          </div>
        </div>

        {/* Active Alerts */}
        <div
          className={`bg-white rounded-2xl border p-5 shadow-2xs flex flex-col justify-between ${
            alertsCount > 0
              ? "border-rose-300 bg-rose-50/20"
              : "border-slate-200/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Active Alerts
            </span>
            <div
              className={`p-2 rounded-xl ${alertsCount > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div
              className={`text-2xl font-black font-mono ${alertsCount > 0 ? "text-rose-600" : "text-slate-900"}`}
            >
              {alertsCount}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {alertsCount > 0
                ? "Threshold breaches detected"
                : "All parameters within safety limit"}
            </p>
          </div>
        </div>

        {/* Monitored Sensors */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Monitored Nodes
            </span>
            <div className="p-2 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-slate-900 font-mono">
              {stats?.active_sensors_count || 4}
            </div>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {stats?.recent_sensors
                ? stats.recent_sensors.slice(0, 2).join(", ")
                : "Active streams"}
            </p>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Engine Health
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-emerald-700 font-mono">
              100%
            </div>
            <p className="mt-1 text-xs text-slate-500">
              FastAPI & MongoDB WebSocket Pipeline
            </p>
          </div>
        </div>
      </div>

      {/* Live Charts Stream */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <LiveCharts liveMetrics={liveMetrics} thresholds={thresholds} />
      </div>
    </div>
  );
}
