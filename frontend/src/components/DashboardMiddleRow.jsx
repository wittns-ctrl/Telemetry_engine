import React from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ShieldCheck, ArrowRight, Activity, Plus } from 'lucide-react';
import { useTelemetryStore } from '../store/telemetryStore';

// Primary series — the bright green peak curve
const ingestionData = [
  { time: 'S', primary: 8,  secondary: 5  },
  { time: 'M', primary: 28, secondary: 18 },
  { time: 'T', primary: 84, secondary: 52 },
  { time: 'W', primary: 20, secondary: 38 },
  { time: 'T', primary: 50, secondary: 62 },
  { time: 'F', primary: 38, secondary: 48 },
  { time: 'S', primary: 6,  secondary: 14 },
];

// Custom dot renderer — only draw a dark filled dot at the "W" dip (index 3)
const CustomDot = (props) => {
  const { cx, cy, index } = props;
  if (index !== 3) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="#0f172a"
      stroke="#ffffff"
      strokeWidth={2}
    />
  );
};

export const DashboardMiddleRow = () => {
  const { alertsCount, monitoredSensors } = useTelemetryStore();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">

      {/* Left Card: Telemetry Ingestion Frequency */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-6 shadow-sm col-span-1 lg:col-span-1 flex flex-col min-h-[300px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-800 text-sm font-bold">Telemetry Ingestion Frequency</h3>
          <select className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
        </div>

        <div className="flex-1 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={ingestionData} margin={{ top: 28, right: 4, left: -24, bottom: 0 }}>
              <defs>
                {/* Vibrant green gradient for the primary peak curve */}
                <linearGradient id="gradPrimary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#10B981" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
                {/* Muted grey/green gradient for the secondary background curve */}
                <linearGradient id="gradSecondary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#94A3B8" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#94A3B8" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <YAxis
                domain={[0, 100]}
                ticks={[25, 50, 75, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#CBD5E1', fontWeight: 500 }}
                width={34}
              />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 600 }}
                dy={8}
              />
              <Tooltip
                cursor={{ stroke: '#E2E8F0', strokeWidth: 1, strokeDasharray: '4 4' }}
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 4px 16px -4px rgba(0,0,0,0.12)',
                  fontSize: '11px',
                }}
                formatter={(val, name) =>
                  name === 'primary' ? [`${val}%`, 'This week'] : [`${val}%`, 'Last week']
                }
              />

              {/* Background / secondary curve — muted grey area */}
              <Area
                type="monotone"
                dataKey="secondary"
                stroke="#CBD5E1"
                strokeWidth={2}
                fill="url(#gradSecondary)"
                dot={false}
                activeDot={false}
                isAnimationActive={true}
              />

              {/* Primary / highlight curve — vibrant green area */}
              <Area
                type="monotone"
                dataKey="primary"
                stroke="#10B981"
                strokeWidth={3}
                fill="url(#gradPrimary)"
                dot={<CustomDot />}
                activeDot={{ r: 5, fill: '#064E3B', stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={true}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Peak badge — "84%" pill at the top of the T (Tuesday) spike */}
          <div
            className="absolute pointer-events-none z-10"
            style={{ top: '4%', left: '39%', transform: 'translateX(-50%)' }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-sm whitespace-nowrap">
                84%
              </span>
              {/* Small dot directly on the line */}
              <div className="w-2 h-2 rounded-full bg-emerald-500 border-2 border-white shadow" />
            </div>
          </div>
        </div>
      </div>

      {/* Middle Card: Active Alert Stream */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
        <div>
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-slate-800 text-sm font-bold">Active Alert Stream</h3>
            <div className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck size={18} className="text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700">
              System Operational — All Sensors Safe
            </span>
          </div>

          <div className="flex items-center gap-6 bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div>
              <div className="text-5xl font-bold text-slate-800 tracking-tight">{alertsCount}</div>
              <div className="text-slate-500 text-xs font-medium mt-1">Active Alerts</div>
            </div>
            <div className="ml-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
               <ShieldCheck size={24} className="text-emerald-500" />
            </div>
          </div>
        </div>

        <button className="mt-4 w-full flex justify-center items-center gap-2 py-2.5 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded-xl hover:bg-emerald-50 transition-colors">
          <Activity size={16} /> View Alerts Stream <ArrowRight size={16} />
        </button>
      </div>

      {/* Right Card: Monitored Sensors */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-6 shadow-sm min-h-[300px] flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-slate-800 text-sm font-bold">Monitored Sensors</h3>
          <button className="bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-slate-200">
            <Plus size={12} /> New
          </button>
        </div>
        
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {monitoredSensors.map((sensor) => (
            <div key={sensor.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    sensor.status === 'online' ? 'bg-emerald-500' :
                    sensor.status === 'warning' ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{sensor.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {sensor.valueLabel} | {sensor.limitLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-semibold ${
                   sensor.status === 'online' ? 'text-emerald-600' :
                   sensor.status === 'warning' ? 'text-orange-600' : 'text-red-600'
                }`}>
                  {sensor.status.charAt(0).toUpperCase() + sensor.status.slice(1)}
                </span>
                <button className="text-slate-300 hover:text-slate-500 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  •••
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
