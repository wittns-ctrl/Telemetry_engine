import React from "react";
import { Thermometer, Cpu, Radio } from "lucide-react";

export function AnalyticsView({ stats }) {
  const totalMetrics = stats?.total_metrics || 0;
  const tempCount = stats?.by_type?.temperature || 0;
  const cpuCount = stats?.by_type?.cpu || 0;
  const netCount = stats?.by_type?.network || 0;

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Telemetry Analytics & Engine Health
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          In-depth statistics for ingested sensor types, system capacity, and
          database distribution.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Temperature Ingests
            </span>
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
              <Thermometer className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900 font-mono">
              {tempCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {totalMetrics ? ((tempCount / totalMetrics) * 100).toFixed(1) : 0}
              % of total streams
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              CPU Ingests
            </span>
            <div className="p-2.5 rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-100">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900 font-mono">
              {cpuCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {totalMetrics ? ((cpuCount / totalMetrics) * 100).toFixed(1) : 0}%
              of total streams
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Network Ingests
            </span>
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Radio className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900 font-mono">
              {netCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {totalMetrics ? ((netCount / totalMetrics) * 100).toFixed(1) : 0}%
              of total streams
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          System Protocol Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 font-mono">
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">
              API Backend
            </span>
            <span className="font-bold text-emerald-700 text-sm">
              FastAPI & Beanie ORM
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 font-mono">
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">
              Database
            </span>
            <span className="font-bold text-slate-800 text-sm">
              MongoDB Instance
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
