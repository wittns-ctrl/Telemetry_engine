import React from "react";
import { TelemetryIngestionStudio } from "./TelemetryIngestionStudio";
import { MetricsExplorer } from "./MetricsExplorer";

export function SensorsView({ onRefreshStats }) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
          WORKSPACE / SENSORS & INGESTION
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
          Polymorphic Sensor Nodes & Ingestion Studio
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Directly submit telemetry data or query historical MongoDB sensor
          records.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <TelemetryIngestionStudio onMetricIngested={onRefreshStats} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <MetricsExplorer onRefreshStats={onRefreshStats} />
      </div>
    </div>
  );
}
