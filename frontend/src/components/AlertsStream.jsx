import React, { useState } from "react";
import {
  AlertOctagon,
  Bell,
  Trash2,
  X,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function AlertsStream({ alerts = [], onClear, onDismiss }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  const filteredAlerts = alerts.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (a.sensor_id && a.sensor_id.toLowerCase().includes(q)) ||
      (a.metric_type && a.metric_type.toLowerCase().includes(q)) ||
      (a.message && a.message.toLowerCase().includes(q))
    );
  });

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl my-6">
      {/* Stream Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertOctagon className="w-5 h-5 animate-pulse" />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Live Alerts Stream
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-300 border border-rose-800/50">
                {alerts.length} Breaches
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time WebSocket alerts triggered by threshold evaluation
              engine
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {alerts.length > 0 && (
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 text-xs font-medium transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Stream</span>
            </button>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title={isCollapsed ? "Expand alerts" : "Collapse alerts"}
          >
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Stream Content */}
      {!isCollapsed && (
        <div className="mt-4">
          {/* Search bar if many alerts */}
          {alerts.length > 3 && (
            <div className="mb-3 relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search alerts by sensor, metric or message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          )}

          {/* List of Alerts */}
          {filteredAlerts.length > 0 ? (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-slate-950/90 border border-rose-900/40 rounded-xl p-3.5 flex items-start justify-between gap-3 shadow-md hover:border-rose-700/60 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                      <Bell className="w-4 h-4 animate-bounce" />
                    </div>
                    <div>
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-600 text-white font-mono">
                          {alert.severity || "CRITICAL"}
                        </span>
                        <span className="text-xs font-semibold text-slate-200 font-mono">
                          {alert.sensor_id}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800">
                          {alert.metric_type}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono ml-auto">
                          {new Date(
                            alert.receivedAt || Date.now(),
                          ).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-rose-200 font-medium leading-relaxed">
                        {alert.message}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                        <span>
                          Reading:{" "}
                          <strong className="text-white">
                            {alert.current_value}
                            {alert.unit}
                          </strong>
                        </span>
                        <span>
                          Max Limit:{" "}
                          <strong className="text-rose-400">
                            {alert.threshold_max}
                            {alert.unit}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onDismiss(alert.id)}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors shrink-0"
                    title="Dismiss alert"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
              <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-medium text-slate-400">
                No active threshold breaches
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Metrics are within designated safety thresholds
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
