import React from "react";
import { Server, Radio } from "lucide-react";

export function SensorsView({ stats }) {
  const sensors = stats?.recent_sensors ?? [];

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Telemetry Sensors
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Sensors that reported a reading among your 100 most recent metrics.
        </p>
      </div>

      {/* Active Sensor Nodes Full Width */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Recently Active Sensors
            </h2>
            <p className="text-xs text-slate-400">
              {sensors.length} sensor{sensors.length === 1 ? "" : "s"} reporting
            </p>
          </div>
          <Server className="w-5 h-5 text-[#0b4d36]" />
        </div>

        {sensors.length === 0 && (
          <p className="text-xs text-slate-400 py-8 text-center">
            No sensors have reported yet. Ingest a metric from Metrics Studio to see it here.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sensors.map((s) => (
            <div
              key={s}
              className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/60 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100/80 text-[#0b4d36] font-bold text-xs flex items-center justify-center border border-emerald-200">
                  <Radio className="w-5 h-5 text-[#0b4d36]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 font-mono">
                    {s}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
