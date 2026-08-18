import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { SettingsView } from './components/SettingsView';
import { DashboardView } from './components/DashboardView';
import { LiveMonitorView } from './components/LiveMonitorView';
import { SensorsView } from './components/SensorsView';
import { AlertsView } from './components/AlertsView';
import { AuthModal } from './components/AuthModal';

import { useTelemetryWebSocket } from './hooks/useTelemetryWebSocket';
import { fetchStats, fetchThresholds, fetchCurrentUser, ingestMetric } from './services/api';

function App() {
  const [_user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const [stats, setStats] = useState(null);
  const [thresholds, setThresholds] = useState({
    temperature: { max: 100 },
    cpu: { max: 90 },
    network: { max: 1000 },
  });

  // Sidebar Active Navigation State ('settings' default as shown in image, or switchable)
  const [activeNav, setActiveNav] = useState('settings');

  // Automated Simulator State
  const [isSimulating, setIsSimulating] = useState(false);
  const [simInterval, setSimInterval] = useState(1000); // ms
  const [breachRate, setBreachRate] = useState(20); // %
  const [simStats, setSimStats] = useState({ totalCount: 0, breachCount: 0, successCount: 0 });

  const simTimerRef = useRef(null);

  // WebSocket Hook
  const {
    alerts,
    liveMetrics,
    clearAlerts,
    dismissAlert,
  } = useTelemetryWebSocket();

  // Load initial metadata
  const loadInitialData = useCallback(async () => {
    try {
      const [statsData, thresholdsData] = await Promise.all([
        fetchStats().catch(() => null),
        fetchThresholds().catch(() => null),
      ]);
      if (statsData) setStats(statsData);
      if (thresholdsData) setThresholds(thresholdsData);

      const currentUser = await fetchCurrentUser().catch(() => null);
      if (currentUser) setUser(currentUser);
    } catch (err) {
      console.error('Error loading initial telemetry metadata:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Automated Stream Simulator Generation Logic
  const generateSimulatedPayload = useCallback(() => {
    const sensors = ['sensor_server_101', 'sensor_edge_node_4', 'sensor_db_cluster_a', 'sensor_gateway_01'];
    const sensor_id = sensors[Math.floor(Math.random() * sensors.length)];

    const metricTypes = ['temperature', 'cpu', 'network'];
    const metric_type = metricTypes[Math.floor(Math.random() * metricTypes.length)];

    const shouldBreach = Math.random() * 100 < breachRate;

    if (metric_type === 'temperature') {
      const maxLimit = thresholds?.temperature?.max || 100;
      const value = shouldBreach
        ? parseFloat((maxLimit + 1 + Math.random() * 30).toFixed(1))
        : parseFloat((20 + Math.random() * (maxLimit - 25)).toFixed(1));
      return { sensor_id, metric_type, value, unit: 'C' };
    } else if (metric_type === 'cpu') {
      const maxLimit = thresholds?.cpu?.max || 90;
      const value = shouldBreach
        ? parseFloat((maxLimit + 1 + Math.random() * 8.5).toFixed(1))
        : parseFloat((10 + Math.random() * (maxLimit - 15)).toFixed(1));
      return { sensor_id, metric_type, value, core_count: 16, process_count: 150 + Math.floor(Math.random() * 100) };
    } else {
      const maxLimit = thresholds?.network?.max || 1000;
      const value = shouldBreach
        ? parseFloat((maxLimit + 50 + Math.random() * 800).toFixed(1))
        : parseFloat((50 + Math.random() * (maxLimit - 100)).toFixed(1));
      return { sensor_id, metric_type, value, bytes_sent: 5000000, bytes_recv: 12000000 };
    }
  }, [breachRate, thresholds]);

  // Simulator interval worker
  useEffect(() => {
    if (isSimulating) {
      simTimerRef.current = setInterval(async () => {
        try {
          const payload = generateSimulatedPayload();
          const result = await ingestMetric(payload);
          setSimStats((prev) => ({
            totalCount: prev.totalCount + 1,
            breachCount: prev.breachCount + (result.alert_triggered ? 1 : 0),
            successCount: prev.successCount + (result.alert_triggered ? 0 : 1),
          }));
        } catch (err) {
          console.error('Simulation step error:', err);
        }
      }, simInterval);
    } else if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
    }

    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, [isSimulating, simInterval, generateSimulatedPayload]);

  const toggleSimulation = () => {
    setIsSimulating((prev) => !prev);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-500 selection:text-white">

      {/* Dark Emerald Sidebar */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        alertsCount={alerts.length || 3}
      />

      {/* Main Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">

        {/* Top Header */}
        <TopHeader
          userName="Mugisha B."
        />

        {/* View Router Body */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">

          {activeNav === 'dashboard' && (
            <DashboardView
              stats={stats}
              alertsCount={alerts.length}
              liveMetrics={liveMetrics}
              thresholds={thresholds}
            />
          )}

          {activeNav === 'live-monitor' && (
            <LiveMonitorView
              liveMetrics={liveMetrics}
              thresholds={thresholds}
              isSimulating={isSimulating}
              toggleSimulation={toggleSimulation}
              simInterval={simInterval}
              setSimInterval={setSimInterval}
              breachRate={breachRate}
              setBreachRate={setBreachRate}
              simStats={simStats}
            />
          )}

          {activeNav === 'sensors' && (
            <SensorsView onRefreshStats={loadInitialData} />
          )}

          {activeNav === 'alerts' && (
            <AlertsView
              alerts={alerts}
              clearAlerts={clearAlerts}
              dismissAlert={dismissAlert}
            />
          )}

          {activeNav === 'settings' && (
            <SettingsView
              thresholds={thresholds}
              onUpdateThresholds={(newLimits) => {
                setThresholds((prev) => ({
                  ...prev,
                  ...newLimits,
                }));
              }}
            />
          )}

        </main>

      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={loadInitialData}
      />

    </div>
  );
}

export default App;
