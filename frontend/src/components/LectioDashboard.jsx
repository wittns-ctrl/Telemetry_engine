import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MetricCards } from './MetricCards';
import { DashboardMiddleRow } from './DashboardMiddleRow';
import { DashboardBottomRow } from './DashboardBottomRow';

export const LectioDashboard = () => {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [isSimulating, setIsSimulating] = useState(false);

  return (
    <div
      className="flex bg-[#F8FAFC] font-sans"
      style={{ minHeight: '100vh', position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto' }}
    >
      {/* Sidebar */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        onLogout={() => window.history.back()}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <Header
          userName="Roland"
          userRole="Admin"
          alertsCount={1}
          onIngestClick={() => console.log('Ingest Metric Clicked')}
          onSimulateClick={() => setIsSimulating((prev) => !prev)}
          isSimulating={isSimulating}
        />

        {/* Dashboard Content Scrollable Area */}
        <main className="flex-1 px-4 md:px-8 pb-10">
          {/* Metric Cards Grid */}
          <MetricCards />
          {/* Middle Row: Area Chart, Active Alerts, Monitored Sensors */}
          <DashboardMiddleRow />
          {/* Bottom Row: Channels and Gauge Chart */}
          <DashboardBottomRow />
        </main>
      </div>
    </div>
  );
};
