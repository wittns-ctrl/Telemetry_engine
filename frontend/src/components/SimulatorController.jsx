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
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs my-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Automated Telemetry Feed Simulator
            </h2>
            <p className="text-xs text-slate-500">
              Generate continuous polymorphic telemetry data streams with
              customizable breach rates
            </p>
          </div>
        </div>

        {/* Start / Pause Button */}
        <button
          onClick={toggleSimulation}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs shadow-xs transition-all ${
            isSimulating
              ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse"
              : "bg-[#0b4d36] hover:bg-[#073924] text-white"
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
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-slate-700">
              Stream Interval
            </span>
            <span className="font-mono text-[#0b4d36] font-extrabold">
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
            className="w-full accent-[#0b4d36] bg-slate-200 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
            <span>Fast (300ms)</span>
            <span>Slow (3.0s)</span>
          </div>
        </div>

        {/* Anomaly Breach Rate Slider */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-slate-700">
              Threshold Breach Rate
            </span>
            <span className="font-mono text-rose-600 font-extrabold">
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
            className="w-full accent-rose-600 bg-slate-200 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
            <span>Normal (0%)</span>
            <span>Heavy Breaches (80%)</span>
          </div>
        </div>

        {/* Simulator Session Stats */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Simulated Ingested
            </span>
            <div className="text-xl font-black font-mono text-slate-900 mt-1">
              {simStats.totalCount}{" "}
              <span className="text-xs font-normal text-slate-500">
                payloads
              </span>
            </div>
          </div>
          <div className="text-right font-mono text-xs">
            <div className="text-rose-600 font-bold">
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
