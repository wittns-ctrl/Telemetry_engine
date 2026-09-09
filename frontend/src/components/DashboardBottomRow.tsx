import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Plus, Wifi, Globe, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useTelemetryStore } from '../store/telemetryStore';

const gaugeData = [
  { name: 'Normal', value: 96, color: '#10B981' },
  { name: 'Warning', value: 3, color: '#F59E0B' },
  { name: 'Breach', value: 1, color: '#EF4444' },
];

export function DashboardBottomRow() {
  const { telemetryChannels, systemSafetyPercentage } = useTelemetryStore();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left Card: Connected Telemetry Channels */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Connected Telemetry Channels
          </h3>
          <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add Sensor
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                <th className="pb-3">Channel</th>
                <th className="pb-3">Protocol</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {telemetryChannels.map((channel) => (
                <tr key={channel.id}>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-900">
                        {channel.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md ${
                        channel.protocol === 'WebSocket'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {channel.protocol === 'WebSocket' ? (
                        <Wifi className="w-3 h-3" />
                      ) : (
                        <Globe className="w-3 h-3" />
                      )}
                      {channel.protocol}
                    </span>
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md ${
                        channel.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {channel.status === 'active' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {channel.status}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-500">
                    {new Date(channel.lastSeen).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Card: Threshold Safety Gauge */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">
          Threshold Safety Gauge
        </h3>
        <div className="flex items-center gap-6">
          <div className="flex-1 h-48">
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
                >
                  {gaugeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1">
            <div className="text-center mb-4">
              <div className="text-4xl font-black text-emerald-700 font-mono">
                {systemSafetyPercentage}%
              </div>
              <p className="text-sm text-slate-600 mt-1">Stream Safe</p>
            </div>
            <div className="space-y-2">
              {gaugeData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-slate-700">{item.name}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-900">
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
