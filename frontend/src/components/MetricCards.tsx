import { TrendingUp, Thermometer, Cpu, Network } from 'lucide-react';
import { useTelemetryStore } from '../store/telemetryStore';

export function MetricCards() {
  const {
    totalMetricsIngested,
    temperatureStreams,
    cpuLoadStreams,
    networkThroughput,
    temperatureLimit,
    cpuLimit,
    networkLimit,
  } = useTelemetryStore();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Total Metrics Ingested - Dark Green Highlighted */}
      <div className="bg-emerald-900 rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-800/30 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider">
              Total Metrics Ingested
            </span>
            <div className="px-2 py-1 text-xs font-medium bg-emerald-500 text-white rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              Live
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white font-mono">
              {totalMetricsIngested}
            </div>
            <div className="mt-3 flex items-center gap-2 text-emerald-300">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">+12% from last hour</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Temperature Streams */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Temperature Streams
          </span>
          <div className="p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-100">
            <Thermometer className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-black text-slate-900 font-mono">
            {temperatureStreams}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Limit: {temperatureLimit}°C</span>
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${(temperatureStreams / temperatureLimit) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: CPU Load Streams */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            CPU Load Streams
          </span>
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <Cpu className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-black text-slate-900 font-mono">
            {cpuLoadStreams}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Limit: {cpuLimit}%</span>
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${(cpuLoadStreams / cpuLimit) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 4: Network Throughput */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Network Throughput
          </span>
          <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
            <Network className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-black text-slate-900 font-mono">
            {networkThroughput}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Limit: {networkLimit} MB/s</span>
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${(networkThroughput / networkLimit) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
