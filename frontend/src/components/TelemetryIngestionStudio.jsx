import React, { useState } from "react";
import {
  Send,
  Zap,
  Flame,
  Cpu,
  Radio,
  CheckCircle2,
  AlertCircle,
  Code
} from "lucide-react";
import { ingestMetric } from "../services/api";

export function TelemetryIngestionStudio({ onMetricIngested }) {
  const [metricType, setMetricType] = useState("temperature"); // 'temperature' | 'cpu' | 'network'
  const [sensorId, setSensorId] = useState("sensor_server_101");
  const [value, setValue] = useState(38.5);

  // Specific fields
  const [unit, setUnit] = useState("C");
  const [coreCount, setCoreCount] = useState(8);
  const [processCount, setProcessCount] = useState(142);
  const [bytesSent, setBytesSent] = useState(124500);
  const [bytesRecv, setBytesRecv] = useState(982000);

  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Construct current payload based on metricType
  const buildPayload = () => {
    const base = {
      sensor_id: sensorId,
      metric_type: metricType,
      value: Number(value),
    };
    if (metricType === "temperature") {
      return { ...base, unit };
    } else if (metricType === "cpu") {
      return {
        ...base,
        core_count: Number(coreCount),
        process_count: Number(processCount),
      };
    } else if (metricType === "network") {
      return {
        ...base,
        bytes_sent: Number(bytesSent),
        bytes_recv: Number(bytesRecv),
      };
    }
    return base;
  };

  const handleIngest = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setLastResponse(null);

    try {
      const payload = buildPayload();
      const result = await ingestMetric(payload);
      setLastResponse(result);
      if (onMetricIngested) {
        onMetricIngested(result);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to ingest metric payload");
    } finally {
      setLoading(false);
    }
  };

  // Quick Preset Handlers
  const applyPreset = (preset) => {
    setErrorMsg(null);
    setLastResponse(null);

    if (preset === "temp_normal") {
      setMetricType("temperature");
      setSensorId("sensor_room_204");
      setValue(24.5);
      setUnit("C");
    } else if (preset === "temp_breach") {
      setMetricType("temperature");
      setSensorId("sensor_datacenter_rack_a");
      setValue(118.4); // Exceeds 100°C
      setUnit("C");
    } else if (preset === "cpu_normal") {
      setMetricType("cpu");
      setSensorId("sensor_k8s_node_02");
      setValue(42.0);
      setCoreCount(16);
      setProcessCount(180);
    } else if (preset === "cpu_breach") {
      setMetricType("cpu");
      setSensorId("sensor_core_api_pod");
      setValue(98.6); // Exceeds 90%
      setCoreCount(32);
      setProcessCount(520);
    } else if (preset === "net_normal") {
      setMetricType("network");
      setSensorId("sensor_edge_router_01");
      setValue(240.0);
      setBytesSent(52428800);
      setBytesRecv(104857600);
    } else if (preset === "net_breach") {
      setMetricType("network");
      setSensorId("sensor_gateway_primary");
      setValue(1850.0); // Exceeds 1000 MB/s
      setBytesSent(890000000);
      setBytesRecv(1920000000);
    }
  };

  const currentPayload = buildPayload();

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl my-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Polymorphic Ingestion Studio
            </h2>
            <p className="text-xs text-slate-400">
              Directly submit telemetry payloads or test threshold alerts with
              presets
            </p>
          </div>
        </div>
      </div>

      {/* Preset Quick Buttons */}
      <div className="mt-4 mb-5">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          One-Click Test Presets
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => applyPreset("temp_normal")}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Normal Temp</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("temp_breach")}
            className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 text-[11px] font-bold text-rose-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <Flame className="w-3 h-3 text-rose-400" />
            <span>🔥 Temp Breach</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("cpu_normal")}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Normal CPU</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("cpu_breach")}
            className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 text-[11px] font-bold text-rose-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <Cpu className="w-3 h-3 text-rose-400" />
            <span>💥 CPU Breach</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("net_normal")}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Normal Net</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("net_breach")}
            className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 text-[11px] font-bold text-rose-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <Radio className="w-3 h-3 text-rose-400" />
            <span>🌊 Net Breach</span>
          </button>
        </div>
      </div>

      {/* Main Ingestion Form & JSON Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Column */}
        <form onSubmit={handleIngest} className="lg:col-span-7 space-y-4">
          {/* Discriminator: Metric Type Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Metric Discriminator Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMetricType("temperature")}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  metricType === "temperature"
                    ? "bg-amber-500/20 border-amber-500 text-amber-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Temperature</span>
              </button>

              <button
                type="button"
                onClick={() => setMetricType("cpu")}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  metricType === "cpu"
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>CPU Usage</span>
              </button>

              <button
                type="button"
                onClick={() => setMetricType("network")}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  metricType === "network"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Network</span>
              </button>
            </div>
          </div>

          {/* Shared Base Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Sensor Identifier
              </label>
              <input
                type="text"
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Value{" "}
                {metricType === "temperature"
                  ? "(°C)"
                  : metricType === "cpu"
                    ? "(%)"
                    : "(MB/s)"}
              </label>
              <input
                type="number"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Polymorphic Dynamic Fields */}
          {metricType === "temperature" && (
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Temperature Unit
              </label>
              <div className="flex gap-2">
                {["C", "F", "K"].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-colors ${
                      unit === u
                        ? "bg-amber-500/20 border-amber-500 text-amber-300"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    °{u}
                  </button>
                ))}
              </div>
            </div>
          )}

          {metricType === "cpu" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Core Count
                </label>
                <input
                  type="number"
                  min="1"
                  value={coreCount}
                  onChange={(e) => setCoreCount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Process Count
                </label>
                <input
                  type="number"
                  min="0"
                  value={processCount}
                  onChange={(e) => setProcessCount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {metricType === "network" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Bytes Sent
                </label>
                <input
                  type="number"
                  min="0"
                  value={bytesSent}
                  onChange={(e) => setBytesSent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Bytes Received
                </label>
                <input
                  type="number"
                  min="0"
                  value={bytesRecv}
                  onChange={(e) => setBytesRecv(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Ingest Telemetry Data</span>
              </>
            )}
          </button>
        </form>

        {/* JSON Preview & Response Column */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          {/* JSON Payload Inspector */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex-1 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
              <span className="flex items-center gap-1.5 text-[11px] font-sans font-semibold">
                <Code className="w-3.5 h-3.5 text-indigo-400" />
                <span>Payload Inspector</span>
              </span>
              <span className="text-[10px] text-slate-500">
                POST /api/v1/metrics
              </span>
            </div>
            <pre className="text-emerald-400 overflow-x-auto text-[11px] leading-relaxed">
              {JSON.stringify(currentPayload, null, 2)}
            </pre>
          </div>

          {/* Response Feedback Card */}
          {lastResponse && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-sans transition-all ${
                lastResponse.alert_triggered
                  ? "bg-rose-950/40 border-rose-800 text-rose-200"
                  : "bg-emerald-950/40 border-emerald-800 text-emerald-200"
              }`}
            >
              <div className="flex items-center gap-2 font-bold mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Metric Ingested Successfully</span>
              </div>
              <p className="text-[11px] font-mono text-slate-300">
                Metric ID: {lastResponse.metric_id}
              </p>
              {lastResponse.alert_triggered && (
                <div className="mt-2 pt-2 border-t border-rose-800/50 text-[11px] font-medium text-rose-300">
                  🚨 Threshold Breach Alert Triggered & Broadcasted!
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-rose-800 bg-rose-950/60 text-rose-200 text-xs font-sans flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Ingestion Error</p>
                <p className="text-[11px] opacity-90 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
