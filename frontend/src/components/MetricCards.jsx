import React from 'react';
import { TrendingUp, Thermometer, Cpu, Network, ArrowUpRight } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../store/telemetryStore';

const mockTrendData = [
  { value: 10 }, { value: 15 }, { value: 13 }, { value: 20 }, 
  { value: 18 }, { value: 25 }, { value: 22 }, { value: 30 }, 
  { value: 28 }, { value: 35 }, { value: 32 }, { value: 45 },
  { value: 40 }, { value: 50 }, { value: 48 }
];

export const MetricCards = () => {
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-6">
      
      {/* Card 1: Total Metrics Ingested (Dark Green) */}
      <div className="bg-[#064E3B] rounded-2xl p-5 md:p-6 text-white shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[160px]">
        <div className="flex justify-between items-start z-10">
          <h3 className="text-emerald-50 text-sm font-medium">Total Metrics Ingested</h3>
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <TrendingUp size={16} className="text-emerald-400" />
          </div>
        </div>
        
        <div className="z-10 mt-2">
          <div className="text-4xl md:text-5xl font-bold tracking-tight mb-2">{totalMetricsIngested}</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-emerald-300 text-xs font-medium">
              <ArrowUpRight size={14} />
              <span>18% from yesterday</span>
            </div>
            <div className="bg-[#047857] text-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
              Live
            </div>
          </div>
        </div>
        
        {/* Background Trend Line */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 opacity-30 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockTrendData}>
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#34D399" 
                fill="#047857" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Card 2: Temperature Streams */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-100 shadow-sm flex flex-col justify-between min-h-[160px]">
        <div className="flex justify-between items-start">
          <h3 className="text-slate-800 text-sm font-bold">Temperature Streams</h3>
          <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
            <Thermometer size={16} className="text-orange-500" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-4xl md:text-5xl font-bold text-slate-800 tracking-tight mb-3">{temperatureStreams}</div>
          <div className="inline-flex bg-orange-50 text-orange-600 text-xs font-semibold px-2.5 py-1 rounded-md">
            Limit: {temperatureLimit}°C
          </div>
        </div>
      </div>

      {/* Card 3: CPU Load Streams */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-100 shadow-sm flex flex-col justify-between min-h-[160px]">
        <div className="flex justify-between items-start">
          <h3 className="text-slate-800 text-sm font-bold">CPU Load Streams</h3>
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
            <Cpu size={16} className="text-blue-500" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-4xl md:text-5xl font-bold text-slate-800 tracking-tight mb-3">{cpuLoadStreams}</div>
          <div className="inline-flex bg-blue-50 text-blue-600 text-xs font-semibold px-2.5 py-1 rounded-md">
            Limit: {cpuLimit}%
          </div>
        </div>
      </div>

      {/* Card 4: Network Throughput */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-100 shadow-sm flex flex-col justify-between min-h-[160px]">
        <div className="flex justify-between items-start">
          <h3 className="text-slate-800 text-sm font-bold">Network Throughput</h3>
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
            <Network size={16} className="text-emerald-500" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-4xl md:text-5xl font-bold text-slate-800 tracking-tight mb-3">{networkThroughput}</div>
          <div className="inline-flex bg-emerald-50 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-md">
            Limit: {networkLimit} MB/s
          </div>
        </div>
      </div>

    </div>
  );
};
