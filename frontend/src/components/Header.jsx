import React from 'react';
import { Search, Mail, Bell, Plus, Play } from 'lucide-react';

export const Header = ({ 
  userName = 'Roland', 
  userRole = 'Admin',
  alertsCount = 1,
  onIngestClick,
  onSimulateClick,
  isSimulating = false
}) => {
  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-6 px-8 gap-4 bg-[#F8FAFC]">
      {/* Greeting */}
      <div>
        <h2 className="text-slate-500 text-sm font-medium mb-1">Welcome back, {userName}! 👋</h2>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Telemetry Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Monitor, ingest, and analyze real-time telemetry streams and sensor alerts.</p>
      </div>

      <div className="flex items-center gap-6 w-full md:w-auto">
        {/* Search */}
        <div className="relative hidden lg:block group w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
          </div>
          <input
            type="text"
            className="w-full bg-white border border-slate-200 text-sm rounded-xl pl-10 pr-12 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm placeholder:text-slate-400"
            placeholder="Search metrics, streams, sensors..."
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
            <div className="text-[10px] font-semibold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50">
              ⌘K
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onIngestClick}
            className="hidden md:flex items-center gap-2 bg-[#064E3B] hover:bg-[#047857] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-emerald-900/10"
          >
            <Plus size={16} strokeWidth={2.5} />
            Ingest Metric
          </button>
          
          <button 
            onClick={onSimulateClick}
            className="hidden md:flex items-center gap-2 bg-white border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Play size={16} className={isSimulating ? "text-emerald-500 animate-pulse fill-emerald-500" : "text-slate-400"} />
            {isSimulating ? "Stop Simulation" : "Simulate Stream"}
          </button>
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-slate-200 hidden md:block"></div>

        {/* Icons & Profile */}
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-slate-400 hover:text-emerald-600 transition-colors rounded-full hover:bg-emerald-50">
            <Mail size={20} />
            <span className="absolute top-1.5 right-1 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full"></span>
          </button>
          
          <button className="relative p-2 text-slate-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50">
            <Bell size={20} />
            {alertsCount > 0 && (
              <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
                {alertsCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-3 ml-2 cursor-pointer hover:bg-slate-100 p-1.5 pr-3 rounded-full transition-colors border border-transparent hover:border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
              {userName.charAt(0)}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-semibold text-slate-700 leading-tight">{userName}</p>
              <p className="text-xs text-slate-400">{userRole}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
