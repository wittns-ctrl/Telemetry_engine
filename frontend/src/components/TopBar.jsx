import React from "react";
import { Search, Mail, Bell, User } from "lucide-react";

export function TopBar({ user, onOpenAuth, alertsCount = 0 }) {
  return (
    <header className="flex items-center justify-between gap-4 py-4 px-6 font-sans">
      {/* Search Input Box */}
      <div className="relative flex items-center w-80">
        <Search className="w-4 h-4 text-slate-400 absolute left-4" />
        <input
          type="text"
          placeholder="Search task or metric..."
          className="w-full bg-white border border-slate-200/80 rounded-full pl-10 pr-12 py-2 text-xs text-slate-700 outline-none focus:border-[#0b4d36] shadow-2xs transition-colors"
        />
        <div className="absolute right-3 flex items-center gap-0.5 text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
          <span>⌘</span>
          <span>F</span>
        </div>
      </div>

      {/* Right User Actions */}
      <div className="flex items-center gap-3">
        {/* Mail Button */}
        <button
          type="button"
          className="w-9 h-9 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-2xs transition-colors"
        >
          <Mail className="w-4 h-4" />
        </button>

        {/* Notification Bell */}
        <button
          type="button"
          className="w-9 h-9 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-2xs transition-colors relative"
        >
          <Bell className="w-4 h-4" />
          {alertsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
          )}
        </button>

        {/* User Profile Capsule */}
        <div
          onClick={onOpenAuth}
          className="flex items-center gap-2.5 bg-white border border-slate-200/80 rounded-full pl-1.5 pr-4 py-1 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 text-amber-800 font-extrabold text-xs flex items-center justify-center overflow-hidden">
            <User className="w-4 h-4 text-amber-800" />
          </div>
          <div className="text-left">
            <div className="text-xs font-extrabold text-slate-900 leading-tight">
              {user?.email?.split("@")[0] || "Totok Michael"}
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              {user?.email || "tmichael20@gmail.com"}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
