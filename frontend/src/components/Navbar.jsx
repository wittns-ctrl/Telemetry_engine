import React from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  User as UserIcon,
  LogOut
} from 'lucide-react';

export function Navbar({
  wsStatus,
  soundEnabled,
  setSoundEnabled,
  isSimulating,
  toggleSimulation,
  user,
  onOpenAuth,
  onLogout,
  criticalAlertsCount = 0
}) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        {/* Left: Branding */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/20">
            <Activity className="w-5 h-5 animate-pulse" />
            {criticalAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 text-[9px] font-bold text-white items-center justify-center">
                  {criticalAlertsCount > 9 ? '9+' : criticalAlertsCount}
                </span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
                Telemetry Engine
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Live Mission Control
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>FastAPI & MongoDB Stream</span>
              <span className="inline-block w-1 h-1 rounded-full bg-slate-600"></span>
              <span>WebSockets Active</span>
            </p>
          </div>
        </div>

        {/* Right: Controls & User */}
        <div className="flex items-center flex-wrap gap-2.5">

          {/* WebSocket Status Indicator */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              wsStatus === 'connected'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : wsStatus === 'connecting'
                ? 'bg-amber-950/40 border-amber-800/60 text-amber-300 animate-pulse'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
          >
            {wsStatus === 'connected' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <Wifi className="w-3.5 h-3.5" />
                <span>WS Live</span>
              </>
            ) : wsStatus === 'connecting' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-spin"></span>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>WS Disconnected</span>
              </>
            )}
          </div>

          {/* Sound Alert Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              soundEnabled
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
            }`}
            title={soundEnabled ? 'Alert audio sound enabled' : 'Alert audio sound muted'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundEnabled ? 'Audio On' : 'Muted'}</span>
          </button>

          {/* Quick Auto Simulator Toggle */}
          <button
            onClick={toggleSimulation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-sm transition-all ${
              isSimulating
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white shadow-indigo-600/20'
            }`}
          >
            {isSimulating ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current text-amber-400" />
                <span>Stop Stream Simulator</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Auto Simulate Feed</span>
              </>
            )}
          </button>

          {/* User Auth Section */}
          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
                <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-mono truncate max-w-[120px]">{user.email}</span>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
            >
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span>Login / Auth</span>
            </button>
          )}

        </div>

      </div>
    </header>
  );
}
