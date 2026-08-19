import React from "react";
import { LiveCharts } from "./LiveCharts";
import { AlertsStream } from "./AlertsStream";
import { SimulatorController } from "./SimulatorController";

export function LiveStreamView({
  liveMetrics,
  thresholds,
  alerts,
  clearAlerts,
  dismissAlert,
  isSimulating,
  toggleSimulation,
  simInterval,
  setSimInterval,
  breachRate,
  setBreachRate,
  simStats,
}) {
  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Live Stream & Real-Time Alerts
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Monitor incoming WebSocket telemetry events and active threshold
          breaches in real time.
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

      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
        <LiveCharts liveMetrics={liveMetrics} thresholds={thresholds} />
      </div>

      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
        <AlertsStream
          alerts={alerts}
          onClear={clearAlerts}
          onDismiss={dismissAlert}
        />
      </div>
    </div>
  );
}
