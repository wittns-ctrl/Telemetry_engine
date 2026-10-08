import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Plus, Radio, ArrowRight } from 'lucide-react';
import { useTelemetryStore } from '../store/telemetryStore';

export const DashboardBottomRow = () => {
  const { telemetryChannels, systemSafetyPercentage } = useTelemetryStore();

  // Data for the semi-circle gauge (180 degrees)
  const gaugeData = [
    { name: 'Safe', value: systemSafetyPercentage, color: '#10B981' },
    { name: 'Warning', value: 0, color: '#F59E0B' },
    { name: 'Breach', value: 100 - systemSafetyPercentage, color: '#EF4444' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
      
      {/* Left Card: Connected Telemetry Channels */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-6 shadow-sm col-span-1 lg:col-span-2 flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-slate-800 text-sm font-bold">Connected Telemetry Channels</h3>
          <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
            <Plus size={14} /> Add Sensor
          </button>
        </div>
        
        <div className="flex-1">
          <div className="space-y-0">
            {telemetryChannels.map((channel, idx) => (
              <div key={channel.id} className={`flex items-center justify-between py-3 ${idx !== telemetryChannels.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                    <Radio size={14} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{channel.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Stream Protocol: {channel.protocol} {channel.protocol === 'WebSocket' ? '/ REST' : ''}</p>
                  </div>
                </div>
                <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wide border border-emerald-100">
                  {channel.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 flex justify-center border-t border-slate-100">
          <button className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-colors">
            View all channels <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Right Card: Threshold Safety Gauge */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col items-center">
        <div className="w-full flex justify-between items-start mb-2">
          <h3 className="text-slate-800 text-sm font-bold">Threshold Safety Gauge</h3>
          <select className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
            <option>All Systems</option>
            <option>Production</option>
          </select>
        </div>

        <div className="relative w-full h-40 flex items-center justify-center mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                cx="50%"
                cy="80%"
                startAngle={180}
                endAngle={0}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                cornerRadius={4}
              >
                {gaugeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          {/* Inner Text */}
          <div className="absolute top-[50%] left-1/2 transform -translate-x-1/2 text-center">
            <div className="text-4xl font-black text-slate-800 tracking-tight">{systemSafetyPercentage}%</div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-1">Stream Safe</div>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full flex justify-between items-center mt-auto px-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-medium text-slate-600">Normal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-xs font-medium text-slate-600">Warning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-xs font-medium text-slate-600">Breach</span>
          </div>
        </div>

      </div>

    </div>
  );
};
