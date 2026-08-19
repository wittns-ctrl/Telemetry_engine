import React from "react";
import { Server, Radio, CheckCircle2 } from "lucide-react";

export function TeamView({ stats }) {
  const sensors = stats?.recent_sensors || [
    "sensor_server_101",
    "sensor_edge_node_4",
    "sensor_db_cluster_a",
    "sensor_gateway_01",
  ];

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Telemetry Sensors
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Active telemetry stream nodes and connected sensor parameters.
        </p>
      </div>

      {/* Active Sensor Nodes Full Width */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Active Telemetry Stream Nodes
            </h2>
            <p className="text-xs text-slate-400">
              Real-time connected sensor stream channels
            </p>
          </div>
          <Server className="w-5 h-5 text-[#0b4d36]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sensors.map((s, idx) => (
            <div
              key={idx}
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
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Protocol: WebSocket / REST Ingest
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Metrics: Temperature | CPU | Network
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                  ONLINE
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
