import React from "react";
import {
  LayoutGrid,
  CheckSquare,
  Calendar,
  BarChart3,
  Server,
  Settings,
  HelpCircle,
  LogOut,
} from "lucide-react";

export function Sidebar({ activeNav, setActiveNav, onLogout, alertsCount = 12 }) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "tasks", label: "Tasks", icon: CheckSquare, badge: `${alertsCount}+` },
    { id: "live", label: "Calendar", icon: Calendar },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "team", label: "Sensors", icon: Server },
  ];

  const generalItems = [
    { id: "settings", label: "Settings", icon: Settings },
    { id: "help", label: "Help", icon: HelpCircle },
  ];

  return (
    <aside className="w-60 bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[calc(100vh-2rem)] my-4 ml-4 shrink-0 font-sans">
      <div>
        {/* Donezo Brand Logo */}
        <div className="flex items-center gap-2.5 px-2 py-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-[#0b4d36]">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
              <path d="M8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12C16 14.2091 14.2091 16 12 16" />
            </svg>
          </div>
          <span className="font-extrabold text-xl text-slate-900 tracking-tight">
            Donezo
          </span>
        </div>

        {/* MENU Section */}
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">
          MENU
        </div>

        <nav className="space-y-1 mb-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                  isActive
                    ? "text-slate-900 font-extrabold bg-slate-100/80 border-l-4 border-[#0b4d36]"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-[#0b4d36]" : "text-slate-400"}`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#0b4d36] text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* GENERAL Section */}
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">
          GENERAL
        </div>

        <nav className="space-y-1">
          {generalItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                  isActive
                    ? "text-slate-900 font-extrabold bg-slate-100/80 border-l-4 border-[#0b4d36]"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${isActive ? "text-[#0b4d36]" : "text-slate-400"}`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
            <span>Logout</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}
