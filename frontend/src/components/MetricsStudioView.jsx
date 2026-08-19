import React from "react";
import { TelemetryIngestionStudio } from "./TelemetryIngestionStudio";
import { MetricsExplorer } from "./MetricsExplorer";

export function MetricsStudioView({ onRefreshStats }) {
  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Tasks & Polymorphic Telemetry
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Ingest polymorphic telemetry payloads (Temperature, CPU, Network) or
          query historical MongoDB data.
        </p>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
        <TelemetryIngestionStudio onMetricIngested={onRefreshStats} />
      </div>

      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
        <MetricsExplorer onRefreshStats={onRefreshStats} />
      </div>
    </div>
  );
}
