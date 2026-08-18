import React from "react";
import { AlertsStream } from "./AlertsStream";

export function AlertsView({ alerts, clearAlerts, dismissAlert }) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
          WORKSPACE / ALERTS STREAM
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
          Active Alert Stream & Threshold Breaches
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Real-time WebSocket alerts dispatched upon threshold rule evaluation.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <AlertsStream
          alerts={alerts}
          onClear={clearAlerts}
          onDismiss={dismissAlert}
        />
      </div>
    </div>
  );
}
