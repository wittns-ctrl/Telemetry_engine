import React, { useState, useEffect } from "react";
import {
  ArrowUpRight,
  Plus,
  Video,
  Play,
  Pause,
  Square,
  TrendingUp,
} from "lucide-react";

export function DonezoDashboard({
  stats,
  _alerts,
  onIngestClick,
  onSimulateClick,
  onViewAlerts,
}) {
  // Time tracker state
  const [seconds, setSeconds] = useState(5048); // 01:24:08
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    let timer = null;
    if (isRunning) {
      timer = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning]);

  const formatTime = (totalSecs) => {
    const hrs = Math.floor(totalSecs / 3600)
      .toString()
      .padStart(2, "0");
    const mins = Math.floor((totalSecs % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSecs % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  };

  const totalMetrics = stats?.total_metrics || 24;
  const tempCount = stats?.by_type?.temperature || 10;
  const cpuCount = stats?.by_type?.cpu || 12;
  const netCount = stats?.by_type?.network || 2;

  return (
    <div className="space-y-6 font-sans">
      {/* Title & Top Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Plan, prioritize, and accomplish your tasks with ease.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onIngestClick}
            className="bg-[#0b4d36] hover:bg-[#073924] text-white font-bold text-xs px-5 py-2.5 rounded-full flex items-center gap-2 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Project</span>
          </button>

          <button
            type="button"
            onClick={onSimulateClick}
            className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs px-5 py-2.5 rounded-full shadow-2xs transition-colors"
          >
            <span>Import Data</span>
          </button>
        </div>
      </div>

      {/* TOP ROW: 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Projects (Active Dark Green) */}
        <div className="bg-[#0b4d36] text-white rounded-3xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-100">
              Total Projects
            </span>
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black tracking-tight">
              {totalMetrics}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium bg-emerald-800/60 px-2.5 py-0.5 rounded-full border border-emerald-700/50">
              <TrendingUp className="w-3 h-3 text-emerald-300" />
              <span>Increased from last month</span>
            </div>
          </div>
        </div>

        {/* Card 2: Ended Projects */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Ended Projects
            </span>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {tempCount}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              <span>Increased from last month</span>
            </div>
          </div>
        </div>

        {/* Card 3: Running Projects */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Running Projects
            </span>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {cpuCount}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              <span>Increased from last month</span>
            </div>
          </div>
        </div>

        {/* Card 4: Pending Project */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between h-36">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Pending Project
            </span>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {netCount}
            </div>
            <div className="mt-2 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100 inline-block">
              On Discuss
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE ROW: Analytics Bar, Reminders, Project Items */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Project Analytics Pill Bar Chart */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              Project Analytics
            </h3>
          </div>

          <div className="flex items-end justify-between gap-3 h-40 pt-4 px-2">
            {[
              { day: "S", height: "60%", pattern: "striped" },
              { day: "M", height: "80%", fill: "#0d4f3b" },
              { day: "T", height: "70%", fill: "#34d399", badge: "74%" },
              { day: "W", height: "95%", fill: "#073327" },
              { day: "T", height: "85%", pattern: "striped" },
              { day: "F", height: "65%", pattern: "striped" },
              { day: "S", height: "75%", pattern: "striped" },
            ].map((bar, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center flex-1 h-full justify-end relative"
              >
                {bar.badge && (
                  <span className="absolute -top-5 text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md border border-emerald-200">
                    {bar.badge}
                  </span>
                )}
                <div
                  className={`w-full rounded-full transition-all ${
                    bar.pattern === "striped"
                      ? "bg-slate-100 border border-slate-300/80 border-dashed"
                      : ""
                  }`}
                  style={{
                    height: bar.height,
                    backgroundColor: bar.fill || undefined,
                  }}
                ></div>
                <span className="text-[10px] font-bold text-slate-400 mt-2">
                  {bar.day}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Reminders Meeting Card */}
        <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Reminders</h3>
            <div className="text-lg font-black text-slate-900 leading-snug">
              Meeting with Arc Company
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Time : 02.00 pm - 04.00 pm
            </p>
          </div>

          <button
            type="button"
            onClick={onViewAlerts}
            className="w-full bg-[#0b4d36] hover:bg-[#073924] text-white font-bold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-colors mt-6"
          >
            <Video className="w-4 h-4 fill-current" />
            <span>Start Meeting</span>
          </button>
        </div>

        {/* Project Task List */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Project</h3>
            <button
              type="button"
              onClick={onIngestClick}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
            >
              + New
            </button>
          </div>

          <div className="space-y-3">
            {[
              {
                title: "Develop API Endpoints",
                due: "Nov 26, 2024",
                color: "bg-indigo-500",
              },
              {
                title: "Onboarding Flow",
                due: "Nov 28, 2024",
                color: "bg-emerald-500",
              },
              {
                title: "Build Dashboard",
                due: "Nov 30, 2024",
                color: "bg-amber-500",
              },
              {
                title: "Optimize Page Load",
                due: "Dec 6, 2024",
                color: "bg-amber-600",
              },
              {
                title: "Cross-Browser Testing",
                due: "Dec 6, 2024",
                color: "bg-purple-500",
              },
            ].map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${p.color} shrink-0`}
                ></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {p.title}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Due date: {p.due}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Team Collaboration, Progress Semi-Donut Gauge, Time Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Team Collaboration Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">
              Team Collaboration
            </h3>
            <button
              type="button"
              className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
            >
              + Add Member
            </button>
          </div>

          <div className="space-y-3">
            {[
              {
                name: "Alexandra Deff",
                task: "Working on Github Project Repository",
                status: "Completed",
                statusColor: "bg-emerald-100 text-emerald-800",
              },
              {
                name: "Edwin Adenike",
                task: "Working on Integrate User Authentication System",
                status: "In Progress",
                statusColor: "bg-amber-100 text-amber-800",
              },
              {
                name: "Isaac Oluwatemilorun",
                task: "Working on Develop Search and Filter Functionality",
                status: "Pending",
                statusColor: "bg-rose-100 text-rose-800",
              },
              {
                name: "David Oshodi",
                task: "Working on Responsive Layout for Homepage",
                status: "In Progress",
                statusColor: "bg-amber-100 text-amber-800",
              },
            ].map((m, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold flex items-center justify-center shrink-0">
                    {m.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {m.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {m.task}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${m.statusColor}`}
                >
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Semi-Donut Gauge Card */}
        <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <h3 className="text-sm font-bold text-slate-900 mb-2">
            Project Progress
          </h3>

          <div className="flex flex-col items-center justify-center my-2 relative">
            <svg className="w-36 h-20" viewBox="0 0 100 50">
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 10 50 A 40 40 0 0 1 70 18"
                fill="none"
                stroke="#073327"
                strokeWidth="14"
                strokeLinecap="round"
              />
            </svg>
            <div className="text-center mt-[-10px]">
              <div className="text-2xl font-black text-slate-900">41%</div>
              <div className="text-[10px] font-bold text-slate-400">
                Project Ended
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-3 border-t border-slate-100">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#073327]"></span>{" "}
              Completed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> In
              Progress
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>{" "}
              Pending
            </span>
          </div>
        </div>

        {/* Time Tracker Wavy Card */}
        <div className="lg:col-span-4 bg-gradient-to-br from-[#073327] via-[#0b4d36] to-[#0d5942] text-white rounded-3xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-100">
              Time Tracker
            </span>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          </div>

          <div className="my-4 text-center">
            <div className="text-4xl font-black font-mono tracking-wider">
              {formatTime(seconds)}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setIsRunning(!isRunning)}
              className="w-10 h-10 rounded-full bg-white text-[#073327] flex items-center justify-center shadow-md hover:bg-slate-100 transition-colors"
            >
              {isRunning ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setSeconds(0);
                setIsRunning(false);
              }}
              className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md hover:bg-rose-500 transition-colors"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
