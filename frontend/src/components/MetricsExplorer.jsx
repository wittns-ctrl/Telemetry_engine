import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  RefreshCw,
  Filter,
  Search,
  Eye,
} from "lucide-react";
import { fetchMetrics } from "../services/api";

export function MetricsExplorer({ onRefreshStats }) {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [metricType, setMetricType] = useState("all");
  const [sensorId, setSensorId] = useState("");
  const [limit, setLimit] = useState(50);
  const [selectedMetricModal, setSelectedMetricModal] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMetrics({
        limit,
        metricType: metricType !== "all" ? metricType : null,
        sensorId: sensorId.trim() || null,
      });
      setMetrics(data);
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      console.error("Failed to load metrics explorer data:", err);
    } finally {
      setLoading(false);
    }
  }, [limit, metricType, sensorId, onRefreshStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl my-6">
      {/* Explorer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Stored Telemetry Explorer
            </h2>
            <p className="text-xs text-slate-400">
              Query historical telemetry records stored in MongoDB
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`}
          />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Filters Bar */}
      <form
        onSubmit={handleSearchSubmit}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4"
      >
        {/* Metric Type Filter */}
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={metricType}
            onChange={(e) => setMetricType(e.target.value)}
            className="w-full bg-transparent text-slate-200 outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-900">
              All Metric Types
            </option>
            <option value="temperature" className="bg-slate-900">
              Temperature
            </option>
            <option value="cpu" className="bg-slate-900">
              CPU Usage
            </option>
            <option value="network" className="bg-slate-900">
              Network
            </option>
          </select>
        </div>

        {/* Sensor ID Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter by sensor_id..."
            value={sensorId}
            onChange={(e) => setSensorId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        {/* Limit Selector */}
        <div className="flex items-center justify-between bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
          <span className="text-slate-400">Fetch Limit:</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-transparent text-indigo-400 font-bold outline-none cursor-pointer"
          >
            <option value="20" className="bg-slate-900">
              20 items
            </option>
            <option value="50" className="bg-slate-900">
              50 items
            </option>
            <option value="100" className="bg-slate-900">
              100 items
            </option>
          </select>
        </div>
      </form>

      {/* Metrics Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-xs font-sans">
          <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Sensor ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Specific Fields</th>
              <th className="px-4 py-3 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {metrics.length > 0 ? (
              metrics.map((m) => (
                <tr
                  key={m.id}
                  className="hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-slate-400 text-[11px]">
                    {new Date(m.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-200">
                    {m.sensor_id}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded font-mono ${
                        m.metric_type === "temperature"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : m.metric_type === "cpu"
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {m.metric_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-bold text-white">
                    {m.value}{" "}
                    {m.payload_data?.unit
                      ? `°${m.payload_data.unit}`
                      : m.metric_type === "cpu"
                        ? "%"
                        : m.metric_type === "network"
                          ? "MB/s"
                          : ""}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">
                    {m.metric_type === "cpu" &&
                      `Cores: ${m.payload_data?.core_count || "-"} | Procs: ${m.payload_data?.process_count || "-"}`}
                    {m.metric_type === "network" &&
                      `Sent: ${m.payload_data?.bytes_sent || 0}B | Recv: ${m.payload_data?.bytes_recv || 0}B`}
                    {m.metric_type === "temperature" &&
                      `Unit: °${m.payload_data?.unit || "C"}`}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setSelectedMetricModal(m)}
                      className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
                      title="View JSON Payload"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="6"
                  className="py-8 text-center text-slate-500 font-mono text-xs"
                >
                  {loading
                    ? "Querying MongoDB metrics..."
                    : "No telemetry records match query"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* JSON Modal Drawer */}
      {selectedMetricModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white font-mono">
                Payload JSON :: {selectedMetricModal.id}
              </h3>
              <button
                onClick={() => setSelectedMetricModal(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 bg-slate-800 rounded"
              >
                Close ✕
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto max-h-80">
              {JSON.stringify(selectedMetricModal, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
