import React from 'react';
import { Search, Plus, Play, Bell, User, ChevronDown } from 'lucide-react';

export function LectioHeader({ className = '' }) {
  return (
    <header className={`bg-white border-b border-slate-100 px-6 py-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Left: Greeting and Search */}
        <div className="flex items-center gap-8">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Welcome back, Roland! 👋
            </h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-80 pl-10 pr-12 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-medium text-slate-400 bg-slate-100 rounded">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Middle: Quick Actions */}
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
            <Plus className="w-4 h-4" />
            Ingest Metric
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
            <Play className="w-4 h-4" />
            Simulate Stream
          </button>
        </div>

        {/* Right: Notifications and Profile */}
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
          </button>
          <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">Roland</span>
              <span className="text-xs text-slate-500">Admin</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
