import React from 'react';
import { 
  Activity, 
  LayoutDashboard, 
  CheckSquare, 
  Calendar, 
  BarChart2, 
  Server, 
  Settings, 
  HelpCircle, 
  LogOut,
  ArrowRight
} from 'lucide-react';

export const Sidebar = ({ activeNav = 'dashboard', setActiveNav, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, badge: 12 },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'sensors', label: 'Sensors', icon: Server },
  ];

  const generalItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <aside className="w-64 bg-[#F8FAFC] min-h-screen flex flex-col px-4 py-6 border-r border-slate-100 hidden md:flex shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2 px-2 mb-10">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
          <Activity size={18} strokeWidth={2.5} />
        </div>
        <span className="font-bold text-xl text-slate-800 tracking-tight">Donezo</span>
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
                    ? 'bg-emerald-50 text-emerald-700 font-medium' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="bg-[#064E3B] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
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
          {generalItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav?.(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-700`}
            >
              <item.icon size={18} strokeWidth={2} className="text-slate-400" />
              <span>{item.label}</span>
            </button>
          ))}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-700 mt-2"
          >
            <LogOut size={18} strokeWidth={2} className="text-slate-400" />
            <span>Logout</span>
          </button>
        </nav>
      </div>

      {/* Bottom Status Card */}
      <div className="mt-auto bg-[#064E3B] rounded-2xl p-5 text-white shadow-sm relative overflow-hidden">
        {/* Decorative background shapes */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-20 blur-2xl rounded-full -mr-10 -mt-10"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
             <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                  <Activity size={14} className="text-emerald-400" />
                </div>
                <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center backdrop-blur-sm">
                   <Server size={14} className="text-emerald-400" />
                </div>
             </div>
          </div>
          <h4 className="font-semibold text-sm mb-1">System Status</h4>
          <p className="text-emerald-50 text-xs mb-4">All systems operational</p>
          <button className="flex items-center gap-2 text-xs font-medium text-emerald-200 hover:text-white transition-colors">
            View status <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
