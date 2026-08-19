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

export function DonezoDashboard({
  stats,
  _alerts,
  onIngestClick,
  onSimulateClick,
  onViewAlerts,
}) {
  const totalMetrics = stats?.total_metrics || 24;
  const tempCount = stats?.by_type?.temperature || 10;
  const cpuCount = stats?.by_type?.cpu || 12;
  const netCount = stats?.by_type?.network || 2;

  return (
    <div className="space-y-6 font-sans">
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
            className="bg-[#0b4d36] hover:bg-[#073924] text-white font-bold text-xs px-5 py-2.5 rounded-full flex items-center gap-2 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Ingest Metric</span>
          </button>

          <button
            type="button"
            onClick={onSimulateClick}
            className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs px-5 py-2.5 rounded-full shadow-2xs transition-colors"
          >
            <span>Simulate Stream</span>
          </button>
        </div>
      </div>

      {/* TOP ROW: 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Ingests (Active Dark Green) */}
        <div className="bg-[#0b4d36] text-white rounded-3xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-100">
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
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium bg-emerald-800/60 px-2.5 py-0.5 rounded-full border border-emerald-700/50">
              <TrendingUp className="w-3 h-3 text-emerald-300" />
              <span>Live MongoDB Persisted</span>
            </div>
          </div>
        </div>

        {/* Card 2: Temp Streams */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Temperature Streams
            </span>
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 border border-amber-100">
              <Thermometer className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {tempCount}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              <span>Limit: 100°C</span>
            </div>
          </div>
        </div>

        {/* Card 3: CPU Streams */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              CPU Load Streams
            </span>
            <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-700 border border-cyan-100">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {cpuCount}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-cyan-800 bg-cyan-50 px-2.5 py-0.5 rounded-full border border-cyan-200">
              <span>Limit: 90%</span>
            </div>
          </div>
        </div>

        {/* Card 4: Network Streams */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Network Throughput
            </span>
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 border border-emerald-100">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {netCount}
            </div>
            <div className="mt-2 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 inline-block">
              Limit: 1000 MB/s
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE ROW: Telemetry Ingestion Activity, Alert Reminders, Monitored Sensors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Project Analytics Pill Bar Chart */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              Telemetry Ingestion Frequency
            </h3>
          </div>

          <div className="flex items-end justify-between gap-3 h-40 pt-4 px-2">
            {[
              { day: "S", height: "60%", pattern: "striped" },
              { day: "M", height: "80%", fill: "#0d4f3b" },
              { day: "T", height: "70%", fill: "#34d399", badge: "84%" },
              { day: "W", height: "95%", fill: "#073327" },
              { day: "T", height: "85%", pattern: "striped" },
              { day: "F", height: "65%", pattern: "striped" },
              { day: "S", height: "75%", pattern: "striped" },
            ].map((bar, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center flex-1 h-full justify-end relative"
              >
                {bar.badge && (
                  <span className="absolute -top-5 text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md border border-emerald-200">
                    {bar.badge}
                  </span>
                )}
                <div
                  className={`w-full rounded-full transition-all ${
                    bar.pattern === "striped"
                      ? "bg-slate-100 border border-slate-300/80 border-dashed"
                      : ""
                  }`}
                  style={{
                    height: bar.height,
                    backgroundColor: bar.fill || undefined,
                  }}
                ></div>
                <span className="text-[10px] font-bold text-slate-400 mt-2">
                  {bar.day}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Active Alert Stream Reminder Card */}
        <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Active Alert Stream
            </h3>
            <div className="text-sm font-black text-slate-900 leading-snug">
              {_alerts?.length > 0
                ? `🚨 ${_alerts[0].severity}: ${_alerts[0].sensor_id}`
                : "System Operational — All Sensors Safe"}
            </div>
            <p className="text-xs font-mono text-slate-500 mt-1">
              Evaluation Engine: WebSocket Live
            </p>
          </div>

          <button
            type="button"
            onClick={onViewAlerts}
            className="w-full bg-[#0b4d36] hover:bg-[#073924] text-white font-bold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-colors mt-6"
          >
            <AlertTriangle className="w-4 h-4 text-amber-300" />
            <span>View Alerts Stream</span>
          </button>
        </div>

        {/* Monitored Sensors List */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Monitored Sensors</h3>
            <button
              type="button"
              onClick={onIngestClick}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
            >
              + New
            </button>
          </div>

          <div className="space-y-3">
            {[
              { title: "sensor_room_101", due: "Type: Temp | Limit: 100°C", color: "bg-amber-500" },
              { title: "sensor_k8s_node_02", due: "Type: CPU | Limit: 90%", color: "bg-cyan-500" },
              { title: "sensor_edge_router_01", due: "Type: Net | Limit: 1000MB/s", color: "bg-emerald-500" },
              { title: "sensor_datacenter_rack_a", due: "Type: Temp | Limit: 100°C", color: "bg-rose-500" },
              { title: "sensor_gateway_primary", due: "Type: Net | Limit: 1000MB/s", color: "bg-emerald-600" },
            ].map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${p.color} shrink-0`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 font-mono truncate">{p.title}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{p.due}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Active Stream Nodes & Threshold Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Connected Sensor Nodes */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              Connected Telemetry Channels
            </h3>
            <button
              type="button"
              onClick={onIngestClick}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
            >
              + Add Sensor
            </button>
          </div>

          <div className="space-y-3">
            {[
              { name: "sensor_server_101", task: "Stream Protocol: WebSocket / REST", status: "ONLINE", statusColor: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
              { name: "sensor_edge_node_4", task: "Stream Protocol: WebSocket / REST", status: "ONLINE", statusColor: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
              { name: "sensor_db_cluster_a", task: "Stream Protocol: WebSocket / REST", status: "ONLINE", statusColor: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
              { name: "sensor_core_gateway", task: "Stream Protocol: WebSocket / REST", status: "ONLINE", statusColor: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
            ].map((m, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-bold flex items-center justify-center shrink-0 text-[#0b4d36]">
                    <Radio className="w-4 h-4 text-[#0b4d36]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 font-mono truncate">{m.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{m.task}</div>
                  </div>
                </div>
                <span
                  className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full shrink-0 ${m.statusColor}`}
                >
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Semi-Donut Gauge Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <h3 className="text-sm font-bold text-slate-900 mb-2">
            Threshold Safety Gauge
          </h3>

          <div className="flex flex-col items-center justify-center my-2 relative">
            <svg className="w-36 h-20" viewBox="0 0 100 50">
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 10 50 A 40 40 0 0 1 82 28"
                fill="none"
                stroke="#073327"
                strokeWidth="14"
                strokeLinecap="round"
              />
            </svg>
            <div className="text-center mt-[-10px]">
              <div className="text-2xl font-black text-slate-900">98%</div>
              <div className="text-[10px] font-bold text-slate-400">
                Stream Safe
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-3 border-t border-slate-100">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#073327]"></span> Normal
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Warning
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Breach
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
