import React from "react";
import {
  Zap,
  LayoutDashboard,
  Activity,
  Server,
  Bell,
  Settings,
} from "lucide-react";

export function Sidebar({ activeNav, setActiveNav, alertsCount = 3 }) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "live-monitor", label: "Live Monitor", icon: Activity },
    { id: "sensors", label: "Sensors", icon: Server },
    { id: "alerts", label: "Alerts", icon: Bell, badge: alertsCount },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0d3b2e] min-h-screen text-white flex flex-col justify-between p-4 shrink-0 transition-all">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-emerald-800/40">
          <div className="w-9 h-9 rounded-full bg-emerald-700/80 flex items-center justify-center text-white shadow-inner">
            <Zap className="w-5 h-5 fill-current text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white leading-none">
              TelemetryPro
            </h1>
            <p className="text-[10px] text-emerald-300/70 font-mono tracking-widest uppercase mt-1">
              ENGINE CONSOLE
            </p>
          </div>
        </div>

        {/* Category Header */}
        <div className="text-[11px] font-bold text-emerald-400/60 uppercase tracking-widest mb-3 px-3">
          WORKSPACE
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all ${
                  isActive
                    ? "bg-white text-[#0d3b2e] font-bold shadow-md"
                    : "text-emerald-100/80 hover:bg-emerald-800/40 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-[#0d3b2e]" : "text-emerald-300/80"}`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      isActive
                        ? "bg-[#0d3b2e] text-white"
                        : "bg-amber-500 text-slate-900"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="px-3 py-2 text-[10px] text-emerald-400/50 font-mono border-t border-emerald-800/40">
        v1.0.0 :: Live Sync
      </div>
    </aside>
  );
}
