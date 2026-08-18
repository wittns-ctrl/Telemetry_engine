import React from "react";
import { Play, Square, Sliders } from "lucide-react";

export function SimulatorController({
  isSimulating,
  toggleSimulation,
  simInterval,
  setSimInterval,
  breachRate,
  setBreachRate,
  simStats,
}) {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl my-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Automated Telemetry Feed Simulator
            </h2>
            <p className="text-xs text-slate-400">
              Generate continuous polymorphic telemetry data streams with
              customizable breach rates
            </p>
          </div>
        </div>

        {/* Start / Pause Button */}
        <button
          onClick={toggleSimulation}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
            isSimulating
              ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20 animate-pulse"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
          }`}
        >
          {isSimulating ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              <span>Pause Simulator Stream</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Start Automated Live Stream</span>
            </>
          )}
        </button>
      </div>

      {/* Simulator Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {/* Stream Interval Slider */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300">
              Stream Interval
            </span>
            <span className="font-mono text-indigo-400 font-bold">
              {simInterval} ms
            </span>
          </div>
          <input
            type="range"
            min="300"
            max="3000"
            step="100"
            value={simInterval}
            onChange={(e) => setSimInterval(Number(e.target.value))}
            className="w-full accent-indigo-500 bg-slate-800 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
            <span>Fast (300ms)</span>
            <span>Slow (3.0s)</span>
          </div>
        </div>

        {/* Anomaly Breach Rate Slider */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300">
              Threshold Breach Rate
            </span>
            <span className="font-mono text-rose-400 font-bold">
              {breachRate}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="80"
            step="5"
            value={breachRate}
            onChange={(e) => setBreachRate(Number(e.target.value))}
            className="w-full accent-rose-500 bg-slate-800 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
            <span>Normal (0%)</span>
            <span>Heavy Breaches (80%)</span>
          </div>
        </div>

        {/* Simulator Session Stats */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Simulated Ingested
            </span>
            <div className="text-xl font-bold font-mono text-white mt-1">
              {simStats.totalCount}{" "}
              <span className="text-xs font-normal text-slate-500">
                payloads
              </span>
            </div>
          </div>
          <div className="text-right font-mono text-xs">
            <div className="text-rose-400 font-semibold">
              {simStats.breachCount} Breaches
            </div>
            <div className="text-slate-500 text-[10px]">
              {simStats.successCount} Normal
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
