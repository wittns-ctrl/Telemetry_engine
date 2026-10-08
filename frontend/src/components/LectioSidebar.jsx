import React from 'react';
import {
  LayoutDashboard,
  Database,
  Activity,
  Settings,
  Users,
  Bell,
  Search,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';

export function LectioSidebar({ className = '' }) {
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', count: null },
    { icon: Database, label: 'Telemetry', count: 12 },
    { icon: Activity, label: 'Live Stream', count: 5 },
    { icon: Bell, label: 'Alerts', count: 3 },
  ];

  const generalItems = [
    { icon: Users, label: 'Team', count: null },
    { icon: Settings, label: 'Settings', count: null },
  ];

  return (
    <aside className={`w-64 bg-white border-r border-slate-100 flex flex-col h-screen ${className}`}>
      {/* Logo */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Lectio</h1>
            <p className="text-xs text-slate-500">by Donezo</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-6 overflow-y-auto">
        {/* Menu Section */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
            Menu
          </h3>
          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.label}>
                <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== null && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                      {item.count}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* General Section */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
            General
          </h3>
          <ul className="space-y-1">
            {generalItems.map((item) => (
              <li key={item.label}>
                <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* System Status Banner */}
      <div className="p-4 border-t border-slate-100">
        <div className="bg-emerald-900 rounded-xl p-4 text-white">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">System Status</p>
              <p className="text-xs text-emerald-200 mt-1">
                All systems operational
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
