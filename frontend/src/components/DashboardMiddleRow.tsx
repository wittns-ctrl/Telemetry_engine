import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { CheckCircle2, AlertTriangle, Wifi, Cpu, Thermometer, Zap } from 'lucide-react';
import { useTelemetryStore } from '../store/telemetryStore';

const ingestionData = [
  { time: '00:00', value: 65 },
  { time: '04:00', value: 72 },
  { time: '08:00', value: 68 },
  { time: '12:00', value: 84 },
  { time: '16:00', value: 78 },
  { time: '20:00', value: 82 },
  { time: '24:00', value: 76 },
];

export function DashboardMiddleRow() {
  const { alertsCount, monitoredSensors } = useTelemetryStore();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left Card: Telemetry Ingestion Frequency */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Telemetry Ingestion Frequency
          </h3>
          <select className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 90 days</option>
          </select>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ingestionData}>
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E293B',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex items-center justify-center">
          <div className="px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="text-2xl font-bold text-emerald-700">84%</span>
            <span className="text-xs text-emerald-600 ml-2">Peak ingestion rate</span>
          </div>
        </div>
      </div>

      {/* Middle Card: Active Alert Stream */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-emerald-700">
              System Operational — All Sensors Safe
            </span>
          </div>
          <div className="mt-8">
            <div className="text-5xl font-black text-slate-900 font-mono">
              {alertsCount}
            </div>
            <p className="text-sm text-slate-500 mt-2">Active Alerts</p>
          </div>
        </div>
        <button className="mt-6 w-full py-3 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors">
          View Alerts Stream
        </button>
      </div>

      {/* Right Card: Monitored Sensors */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Monitored Sensors</h3>
        <div className="space-y-3">
          {monitoredSensors.map((sensor) => (
            <div
              key={sensor.id}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    sensor.status === 'online'
                      ? 'bg-emerald-500'
                      : sensor.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">{sensor.name}</p>
                  <p className="text-xs text-slate-500">
                    {sensor.value} {sensor.unit}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Limit</p>
                <p className="text-sm font-medium text-slate-700">
                  {sensor.threshold} {sensor.unit}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
