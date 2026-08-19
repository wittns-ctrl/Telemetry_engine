import React, { useState } from "react";
import {
  Send,
  Zap,
  Flame,
  Cpu,
  Radio,
  Globe,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Code,
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
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs my-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-emerald-50 text-[#0b4d36] border border-emerald-100">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Polymorphic Ingestion Studio
            </h2>
            <p className="text-xs text-slate-500">
              Directly submit telemetry payloads or test threshold alerts with
              presets
            </p>
          </div>
        </div>
      </div>

      {/* Preset Quick Buttons */}
      <div className="mt-4 mb-5">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
          One-Click Test Presets
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => applyPreset("temp_normal")}
            className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] font-bold text-slate-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Normal Temp</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("temp_breach")}
            className="px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[11px] font-bold text-rose-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            <span>Temp Breach</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("cpu_normal")}
            className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] font-bold text-slate-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Normal CPU</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("cpu_breach")}
            className="px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[11px] font-bold text-rose-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-rose-600" />
            <span>CPU Breach</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("net_normal")}
            className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] font-bold text-slate-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Normal Net</span>
          </button>

          <button
            type="button"
            onClick={() => applyPreset("net_breach")}
            className="px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[11px] font-bold text-rose-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5 text-rose-600" />
            <span>Net Breach</span>
          </button>
        </div>
      </div>

      {/* Main Ingestion Form & JSON Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Column */}
        <form onSubmit={handleIngest} className="lg:col-span-7 space-y-4">
          {/* Discriminator: Metric Type Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Metric Discriminator Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMetricType("temperature")}
                className={`py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  metricType === "temperature"
                    ? "bg-amber-100 border-amber-300 text-amber-900 shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                <span>Temperature</span>
              </button>

              <button
                type="button"
                onClick={() => setMetricType("cpu")}
                className={`py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  metricType === "cpu"
                    ? "bg-cyan-100 border-cyan-300 text-cyan-900 shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-600" />
                <span>CPU Usage</span>
              </button>

              <button
                type="button"
                onClick={() => setMetricType("network")}
                className={`py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  metricType === "network"
                    ? "bg-emerald-100 border-emerald-300 text-emerald-900 shadow-xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-emerald-600" />
                <span>Network</span>
              </button>
            </div>
          </div>

          {/* Shared Base Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Sensor Identifier
              </label>
              <input
                type="text"
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-[#0b4d36] transition-all font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
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
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-[#0b4d36] transition-all font-mono"
              />
            </div>
          </div>

          {/* Polymorphic Dynamic Fields */}
          {metricType === "temperature" && (
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Temperature Unit
              </label>
              <div className="flex gap-2">
                {["C", "F", "K"].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                      unit === u
                        ? "bg-amber-100 border-amber-300 text-amber-900 shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-600"
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
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Core Count
                </label>
                <input
                  type="number"
                  min="1"
                  value={coreCount}
                  onChange={(e) => setCoreCount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-mono outline-none focus:bg-white focus:border-[#0b4d36]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Process Count
                </label>
                <input
                  type="number"
                  min="0"
                  value={processCount}
                  onChange={(e) => setProcessCount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-mono outline-none focus:bg-white focus:border-[#0b4d36]"
                />
              </div>
            </div>
          )}

          {metricType === "network" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Bytes Sent
                </label>
                <input
                  type="number"
                  min="0"
                  value={bytesSent}
                  onChange={(e) => setBytesSent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-mono outline-none focus:bg-white focus:border-[#0b4d36]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Bytes Received
                </label>
                <input
                  type="number"
                  min="0"
                  value={bytesRecv}
                  onChange={(e) => setBytesRecv(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-mono outline-none focus:bg-white focus:border-[#0b4d36]"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-full bg-[#0b4d36] hover:bg-[#073924] text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex-1 font-mono text-xs shadow-inner">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400">
              <span className="flex items-center gap-1.5 text-[11px] font-sans font-bold">
                <Code className="w-3.5 h-3.5 text-emerald-400" />
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
              className={`p-4 rounded-2xl border text-xs font-sans transition-all ${
                lastResponse.alert_triggered
                  ? "bg-rose-50 border-rose-200 text-rose-900"
                  : "bg-emerald-50 border-emerald-200 text-emerald-900"
              }`}
            >
              <div className="flex items-center gap-2 font-bold mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Metric Ingested Successfully</span>
              </div>
              <p className="text-[11px] font-mono text-slate-600">
                Metric ID: {lastResponse.metric_id}
              </p>
              {lastResponse.alert_triggered && (
                <div className="mt-2 pt-2 border-t border-rose-200 text-[11px] font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Threshold Breach Alert Triggered & Broadcasted!</span>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 text-xs font-sans flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Ingestion Error</p>
                <p className="text-[11px] opacity-90 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
