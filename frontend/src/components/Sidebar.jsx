import React from 'react';
import { 
  LayoutDashboard, 
  Database, 
  Radio, 
  BarChart2, 
  Server, 
  Settings, 
  HelpCircle, 
  LogOut,
  ArrowRight,
  Cpu
} from 'lucide-react';
import { LectioMark } from './LectioMark';

// Item ids must match the views rendered in App.jsx.
export const Sidebar = ({ activeNav = 'dashboard', setActiveNav, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'My Devices', icon: Cpu },
    { id: 'metrics', label: 'Metrics Studio', icon: Database },
    { id: 'live', label: 'Live Stream', icon: Radio },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'sensors', label: 'Sensors', icon: Server },
  ];

  const generalItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <aside className="w-64 glass sticky top-3 self-start h-[calc(100vh-1.5rem)] m-3 mr-0 rounded-3xl flex-col px-4 py-6 hidden md:flex shrink-0 overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-2 px-2 mb-10">
        <div className="w-8 h-8 rounded-full bg-ink-900 flex items-center justify-center text-white">
          <LectioMark size={18} />
        </div>
        <span className="font-bold text-lg text-slate-800 tracking-tight whitespace-nowrap">Lectio</span>
      </div>

      {/* Menu Section */}
      <div className="mb-8 flex-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Menu</div>
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav?.(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                  isActive 
                    ? 'bg-ink-900 text-white font-medium shadow-sm' 
                    : 'text-slate-500 hover:bg-ink-900/5 hover:text-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="bg-[#1c1c1f] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* General Section */}
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 mt-8 px-2">General</div>
        <nav className="space-y-1">
          {generalItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav?.(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-ink-900 text-white font-medium shadow-sm'
                    : 'text-slate-500 hover:bg-ink-900/5 hover:text-slate-800'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-slate-500 hover:bg-ink-900/5 hover:text-slate-800 mt-2"
          >
            <LogOut size={18} className="text-slate-400" />
            <span>Logout</span>
          </button>
        </nav>
      </div>

      {/* Bottom Status Card */}
      <div className="mt-auto glass-dark rounded-2xl p-5 text-white shadow-sm relative overflow-hidden">
        {/* Decorative background shapes */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 blur-2xl rounded-full -mr-10 -mt-10"></div>
        <div className="relative z-10">
          <h4 className="font-semibold text-sm mb-1">System Status</h4>
          <p className="text-white/70 text-xs mb-4 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent-400"></span>All systems operational</p>
          <button className="flex items-center gap-2 text-xs font-medium text-white/75 hover:text-white transition-colors">
            View status <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
