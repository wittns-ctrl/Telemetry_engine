import React from "react";
import { Bell, ChevronDown } from "lucide-react";

export function TopHeader({
  userName = "Mugisha B.",
}) {
  return (
    <header className="bg-white border-b border-slate-200/80 px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Left: System Status Indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span className="text-xs font-medium text-slate-600">
          All systems operational
        </span>
      </div>

      {/* Right: Notification Bell & User Dropdown */}
      <div className="flex items-center gap-5">
        {/* Bell Button */}
        <button
          type="button"
          className="relative p-1.5 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-slate-100"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-2.5 cursor-pointer group">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center border border-emerald-200 shadow-2xs">
            MB
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-bold text-slate-800 leading-tight group-hover:text-emerald-700 transition-colors">
              {userName}
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Administrator
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </div>
      </div>
    </header>
  );
}
