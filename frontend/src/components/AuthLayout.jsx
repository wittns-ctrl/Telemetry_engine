import React from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Cpu,
  Server,
  Database,
  Cloud,
} from "lucide-react";

// ── Left Brand Panel with Telemetry Illustration ─────────────────────────────
export function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col bg-[#003D30] relative overflow-hidden w-1/2 rounded-l-3xl">
      {/* Background decorative elements */}
      <div className="absolute w-80 h-80 rounded-full bg-white/5 -top-16 -right-16" />
      <div className="absolute w-56 h-56 rounded-full bg-white/5 bottom-8 -left-12" />
      <div className="absolute w-32 h-32 rounded-full bg-emerald-400/10 top-1/2 right-6" />

      {/* Logo positioned at top-left */}
      <div className="flex items-center gap-2 mt-5 ml-6 relative z-10">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
          <div className="w-3.5 h-3.5 border-2 border-white rounded-full" />
        </div>
        <span className="font-bold text-white text-base tracking-tight">Donezo</span>
      </div>

      {/* Main heading and description */}
      <div className="mt-8 ml-6 mr-6 relative z-10">
        <h2 className="text-white font-bold text-[26px] leading-tight mb-3">
          Real-time telemetry.<br />Smarter decisions.
        </h2>
        <p className="text-white/70 text-sm leading-relaxed max-w-sm">
          Monitor, ingest, and analyze your telemetry<br />streams in real time.
        </p>
      </div>

      {/* Telemetry Illustration */}
      <div className="flex-1 flex items-center justify-center p-5 relative z-10">
        <TelemetryIllustration />
      </div>

      {/* Feature highlights at bottom */}
      <div className="grid grid-cols-3 gap-3 p-6 relative z-10">
        <FeatureItem 
          icon={<Activity className="w-4 h-4" />} 
          title="Real-time Monitoring" 
          description="Track everything as it happens." 
        />
        <FeatureItem 
          icon={<BarChart3 className="w-4 h-4" />} 
          title="Powerful Analytics" 
          description="Visualize and analyze data." 
        />
        <FeatureItem 
          icon={<Bell className="w-4 h-4" />} 
          title="Instant Alerts" 
          description="Get notified instantly." 
        />
      </div>
    </div>
  );
}

// ── Mobile Brand Header (shown on mobile/tablet) ───────────────────────────────
export function MobileBrandHeader() {
  return (
    <div className="lg:hidden flex flex-col items-center justify-center bg-[#003D30] p-4 rounded-t-3xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
          <div className="w-3 h-3 border-2 border-white rounded-full" />
        </div>
        <span className="font-bold text-white text-sm tracking-tight">Donezo</span>
      </div>
      <h2 className="text-white font-bold text-lg text-center leading-tight mb-1.5">
        Real-time telemetry.<br />Smarter decisions.
      </h2>
      <p className="text-white/70 text-xs text-center leading-relaxed">
        Monitor, ingest, and analyze your telemetry streams in real time.
      </p>
    </div>
  );
}

// ── Telemetry Illustration Component ────────────────────────────────────────
function TelemetryIllustration() {
  return (
    <div className="relative w-full max-w-md scale-90">
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {/* Line from left sensor to dashboard */}
        <line x1="10%" y1="50%" x2="30%" y2="50%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
        {/* Line from right device to dashboard */}
        <line x1="70%" y1="30%" x2="50%" y2="50%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
        {/* Line from database to dashboard */}
        <line x1="15%" y1="75%" x2="35%" y2="60%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
        {/* Line from cloud to dashboard */}
        <line x1="85%" y1="70%" x2="65%" y2="55%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
      </svg>

      {/* Left sensor device */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ zIndex: 1 }}>
        <div className="w-12 h-12 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center">
          <div className="w-6 h-6 bg-emerald-400/30 rounded-lg flex items-center justify-center">
            <Cpu className="w-4 h-4 text-emerald-300" />
          </div>
        </div>
      </div>

      {/* Right connected device with WiFi signal */}
      <div className="absolute right-0 top-[20%]" style={{ zIndex: 1 }}>
        <div className="relative">
          {/* WiFi signal lines */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 space-y-0.5">
            <div className="w-5 h-0.5 bg-white/30 rounded" />
            <div className="w-3.5 h-0.5 bg-white/40 rounded ml-0.5" />
            <div className="w-2 h-0.5 bg-white/50 rounded ml-1" />
          </div>
          <div className="w-12 h-12 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center">
            <div className="w-6 h-6 bg-emerald-400/30 rounded-lg flex items-center justify-center">
              <Server className="w-4 h-4 text-emerald-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Database cylinder (lower left) */}
      <div className="absolute left-[5%] bottom-[15%]" style={{ zIndex: 1 }}>
        <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center">
          <Database className="w-5 h-5 text-emerald-300" />
        </div>
      </div>

      {/* Cloud icon (lower right) */}
      <div className="absolute right-[5%] bottom-[20%]" style={{ zIndex: 1 }}>
        <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center">
          <Cloud className="w-5 h-5 text-emerald-300" />
        </div>
      </div>

      {/* Central dashboard panel */}
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 relative" style={{ zIndex: 2 }}>
        {/* Dashboard header with indicators */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-400/50" />
            <div className="w-2 h-2 rounded-full bg-yellow-400/50" />
            <div className="w-2 h-2 rounded-full bg-green-400/50" />
          </div>
          <div className="flex gap-1.5">
            <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
            </div>
          </div>
        </div>

        {/* Dashboard content grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Left side - data indicators */}
          <div className="space-y-2">
            <div className="bg-white/5 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <div className="text-white/60 text-[10px]">Status</div>
              </div>
              <div className="text-white font-semibold text-xs">Active</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <div className="text-white/60 text-[10px]">Connections</div>
              </div>
              <div className="text-white font-semibold text-xs">247</div>
            </div>
          </div>

          {/* Right side - uptime gauge */}
          <div className="bg-white/5 rounded-lg p-2 flex flex-col items-center justify-center">
            <div className="relative w-12 h-12 mb-1">
              <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2"
                  strokeDasharray="98.2, 100"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">98.2%</span>
              </div>
            </div>
            <div className="text-white/60 text-[10px]">Uptime</div>
          </div>
        </div>

        {/* Line chart */}
        <div className="mt-3 bg-white/5 rounded-lg p-2">
          <div className="flex items-end gap-0.5 h-8">
            {[25, 40, 35, 55, 45, 70, 60, 80, 50, 90, 65, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all"
                style={{
                  height: `${h}%`,
                  backgroundColor: i === 11 ? "rgba(52,211,153,0.9)" : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
          <div className="text-white/60 text-[10px] mt-1 text-center">Telemetry Stream</div>
        </div>

        {/* Bottom row - bar chart and list */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-white/5 rounded-lg p-2">
            <div className="flex items-end gap-0.5 h-6">
              {[40, 60, 35, 80, 55, 70, 45, 90].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i === 7 ? "rgba(52,211,153,0.8)" : "rgba(255,255,255,0.15)",
                  }}
                />
              ))}
            </div>
            <div className="text-white/60 text-[10px] mt-0.5 text-center">Metrics</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-emerald-400" />
                  <div className="h-1 bg-white/20 rounded flex-1" style={{ width: `${60 + i * 10}%` }} />
                </div>
              ))}
            </div>
            <div className="text-white/60 text-[10px] mt-0.5 text-center">Events</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature Item Component ───────────────────────────────────────────────────
function FeatureItem({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-8 h-8 rounded-lg bg-emerald-400/20 flex items-center justify-center mb-1.5">
        <div className="text-emerald-300">{icon}</div>
      </div>
      <div className="text-white font-semibold text-[10px] mb-0.5">{title}</div>
      <div className="text-white/50 text-[9px] leading-tight">{description}</div>
    </div>
  );
}

// ── Page wrapper with centered card layout ────────────────────────────────────
export function AuthPageLayout({ children }) {
  return (
    <div className="h-screen flex items-center justify-center font-sans bg-[#e8ecef] p-4 md:p-6 overflow-hidden">
      <div className="w-full max-w-6xl h-[95vh] max-h-[800px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">
        {/* Mobile brand header */}
        <MobileBrandHeader />
        {/* Left brand panel (desktop only) */}
        <BrandPanel />
        {/* Right form panel */}
        <div className="flex-1 bg-white/95 backdrop-blur-sm rounded-r-none lg:rounded-r-3xl flex flex-col justify-center px-5 md:px-10 lg:px-14 py-6 lg:py-8 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Error Banner Component ───────────────────────────────────────────────────
export function ErrorBanner({ msg }) {
  return msg ? (
    <div className="mb-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{msg}</div>
  ) : null;
}

// ── Success Banner Component ─────────────────────────────────────────────────
export function SuccessBanner({ msg }) {
  return msg ? (
    <div className="mb-4 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">{msg}</div>
  ) : null;
}
