import React from "react";
import { LiveCharts } from "./LiveCharts";
import { SimulatorController } from "./SimulatorController";

export function LiveMonitorView({
  liveMetrics,
  thresholds,
  isSimulating,
  toggleSimulation,
  simInterval,
  setSimInterval,
  breachRate,
  setBreachRate,
  simStats,
}) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
          WORKSPACE / LIVE MONITOR
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
          Real-Time Sensor Telemetry Feed
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Monitor streaming metrics with active threshold breach limits.
        </p>
      </div>

      <SimulatorController
        isSimulating={isSimulating}
        toggleSimulation={toggleSimulation}
        simInterval={simInterval}
        setSimInterval={setSimInterval}
        breachRate={breachRate}
        setBreachRate={setBreachRate}
        simStats={simStats}
      />

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <LiveCharts liveMetrics={liveMetrics} thresholds={thresholds} />
      </div>
    </div>
  );
}
