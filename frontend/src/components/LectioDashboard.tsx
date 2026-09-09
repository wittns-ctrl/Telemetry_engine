import { LectioSidebar } from './LectioSidebar';
import { LectioHeader } from './LectioHeader';
import { MetricCards } from './MetricCards';
import { DashboardMiddleRow } from './DashboardMiddleRow';
import { DashboardBottomRow } from './DashboardBottomRow';

export function LectioDashboard() {
  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <LectioSidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <LectioHeader />

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Title */}
            <div>
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                Workspace / Dashboard
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                Telemetry Overview
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Real-time metrics stream, threshold evaluations, and active node status.
              </p>
            </div>

            {/* Metric Cards Grid */}
            <MetricCards />

            {/* Middle Row: Charts and Sensors */}
            <DashboardMiddleRow />

            {/* Bottom Row: Channels and Gauge */}
            <DashboardBottomRow />
          </div>
        </main>
      </div>
    </div>
  );
}
