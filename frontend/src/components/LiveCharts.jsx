import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Thermometer, Cpu, Radio, Layers, Filter } from "lucide-react";

export function LiveCharts({ liveMetrics = [], thresholds }) {
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'temperature' | 'cpu' | 'network'
  const [selectedSensor, setSelectedSensor] = useState("all");

  // Extract unique sensors from live metrics
  const sensorsList = useMemo(() => {
    const set = new Set();
    liveMetrics.forEach((m) => {
      if (m.sensor_id) set.add(m.sensor_id);
    });
    return Array.from(set);
  }, [liveMetrics]);

  // Prepare chart series data
  const tempChartData = useMemo(() => {
    return liveMetrics
      .filter(
        (m) =>
          m.metric_type === "temperature" &&
          (selectedSensor === "all" || m.sensor_id === selectedSensor),
      )
      .map((m) => ({
        time: m.timeLabel,
        value: m.value,
        sensor: m.sensor_id,
        unit: m.payload_data?.unit || "C",
        isBreach: m.value > (thresholds?.temperature?.max || 100),
      }));
  }, [liveMetrics, selectedSensor, thresholds]);

  const cpuChartData = useMemo(() => {
    return liveMetrics
      .filter(
        (m) =>
          m.metric_type === "cpu" &&
          (selectedSensor === "all" || m.sensor_id === selectedSensor),
      )
      .map((m) => ({
        time: m.timeLabel,
        value: m.value,
        sensor: m.sensor_id,
        isBreach: m.value > (thresholds?.cpu?.max || 90),
      }));
  }, [liveMetrics, selectedSensor, thresholds]);

  const netChartData = useMemo(() => {
    return liveMetrics
      .filter(
        (m) =>
          m.metric_type === "network" &&
          (selectedSensor === "all" || m.sensor_id === selectedSensor),
      )
      .map((m) => ({
        time: m.timeLabel,
        value: m.value,
        sensor: m.sensor_id,
        isBreach: m.value > (thresholds?.network?.max || 1000),
      }));
  }, [liveMetrics, selectedSensor, thresholds]);

  const tempMaxThreshold = thresholds?.temperature?.max || 100;
  const cpuMaxThreshold = thresholds?.cpu?.max || 90;
  const netMaxThreshold = thresholds?.network?.max || 1000;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl my-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping"></div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Real-Time Telemetry Streams
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Live time-series visualization with threshold breach lines
          </p>
        </div>

        {/* Tab & Filter Controls */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Sensor Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSensor}
              onChange={(e) => setSelectedSensor(e.target.value)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">
                All Sensors
              </option>
              {sensorsList.map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Metric View Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Charts</span>
            </button>
            <button
              onClick={() => setActiveTab("temperature")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "temperature"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Temp (°C)</span>
            </button>
            <button
              onClick={() => setActiveTab("cpu")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "cpu"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>CPU (%)</span>
            </button>
            <button
              onClick={() => setActiveTab("network")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === "network"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Network</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chart Grid */}
      <div
        className={`grid gap-6 ${activeTab === "all" ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1"}`}
      >
        {/* TEMPERATURE CHART */}
        {(activeTab === "all" || activeTab === "temperature") && (
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Temperature (°C)
                </span>
              </div>
              <span className="text-[10px] font-mono text-rose-400 bg-rose-950/40 border border-rose-800/50 px-2 py-0.5 rounded">
                Max Threshold: {tempMaxThreshold}°C
              </span>
            </div>
            <div className="h-56 w-full">
              {tempChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tempChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="time"
                      stroke="#64748b"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fontSize: 10 }}
                      domain={[-20, "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(val) => [`${val}°C`, "Temperature"]}
                    />
                    <ReferenceLine
                      y={tempMaxThreshold}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{
                        value: `LIMIT ${tempMaxThreshold}°C`,
                        fill: "#f87171",
                        fontSize: 10,
                        position: "insideTopRight",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#f59e0b" }}
                      activeDot={{ r: 6, fill: "#ef4444" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                  Awaiting temperature stream...
                </div>
              )}
            </div>
          </div>
        )}

        {/* CPU CHART */}
        {(activeTab === "all" || activeTab === "cpu") && (
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  CPU Usage (%)
                </span>
              </div>
              <span className="text-[10px] font-mono text-rose-400 bg-rose-950/40 border border-rose-800/50 px-2 py-0.5 rounded">
                Max Threshold: {cpuMaxThreshold}%
              </span>
            </div>
            <div className="h-56 w-full">
              {cpuChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cpuChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="time"
                      stroke="#64748b"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fontSize: 10 }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(val) => [`${val}%`, "CPU Load"]}
                    />
                    <ReferenceLine
                      y={cpuMaxThreshold}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{
                        value: `LIMIT ${cpuMaxThreshold}%`,
                        fill: "#f87171",
                        fontSize: 10,
                        position: "insideTopRight",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#06b6d4"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#06b6d4" }}
                      activeDot={{ r: 6, fill: "#ef4444" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                  Awaiting CPU stream...
                </div>
              )}
            </div>
          </div>
        )}

        {/* NETWORK CHART */}
        {(activeTab === "all" || activeTab === "network") && (
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Network Throughput (MB/s)
                </span>
              </div>
              <span className="text-[10px] font-mono text-rose-400 bg-rose-950/40 border border-rose-800/50 px-2 py-0.5 rounded">
                Max Threshold: {netMaxThreshold} MB/s
              </span>
            </div>
            <div className="h-56 w-full">
              {netChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="time"
                      stroke="#64748b"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fontSize: 10 }}
                      domain={[0, "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(val) => [`${val} MB/s`, "Throughput"]}
                    />
                    <ReferenceLine
                      y={netMaxThreshold}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{
                        value: `LIMIT ${netMaxThreshold}MB/s`,
                        fill: "#f87171",
                        fontSize: 10,
                        position: "insideTopRight",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#10b981" }}
                      activeDot={{ r: 6, fill: "#ef4444" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                  Awaiting network stream...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
