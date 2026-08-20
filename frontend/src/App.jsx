import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DonezoDashboard } from './components/DonezoDashboard';
import { MetricsStudioView } from './components/MetricsStudioView';
import { LiveStreamView } from './components/LiveStreamView';
import { AnalyticsView } from './components/AnalyticsView';
import { TeamView } from './components/TeamView';
import { SettingsView } from './components/SettingsView';
import { AuthPage } from './components/AuthPage';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import { LayoutGrid, CheckSquare, Calendar, BarChart3, Server, Settings, HelpCircle } from 'lucide-react';

import { useTelemetryWebSocket } from './hooks/useTelemetryWebSocket';
import { fetchStats, fetchThresholds, fetchCurrentUser, ingestMetric } from './services/api';

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Always authenticated for development

  const [stats, setStats] = useState(null);
  const [thresholds, setThresholds] = useState({
    temperature: { max: 100 },
    cpu: { max: 90 },
    network: { max: 1000 },
  });

  // Navigation state ('dashboard' default as shown in Donezo design)
  const [activeNav, setActiveNav] = useState('dashboard');

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

  const handleSignOut = () => {
    // Clear authentication
    localStorage.removeItem("telemetry_jwt_token");
    setUser(null);
    setIsAuthenticated(true); // Keep authenticated for development
    
    // Redirect to sign in page
    navigate("/signin");
  };

  const toggleSimulation = () => {
    setIsSimulating((prev) => !prev);
  };

  // Define menu items for lookup
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "live", label: "Calendar", icon: Calendar },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "team", label: "Sensors", icon: Server },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "help", label: "Help", icon: HelpCircle },
  ];

  // Profile Image State
  const [profileImage, setProfileImage] = useState("https://ui-avatars.com/api/?name=Roland+Donald&background=f1f5f9&color=0f172a&size=150");

  const activeItem = menuItems.find(item => item.id === activeNav) || menuItems[0];

  // Show full-page auth routes
  return (
    <Routes>
      <Route path="/signin" element={<AuthPage onAuthSuccess={() => { loadInitialData(); navigate("/"); }} />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/" element={
        <div className="flex min-h-screen bg-[#f3f5f7] text-slate-900 font-sans">
          {/* Floating Donezo White Card Sidebar */}
          <Sidebar
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            onLogout={handleSignOut}
            alertsCount={alerts.length || 12}
          />

          {/* Main Right Body */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#f3f5f7] py-2 px-4 md:px-6">

            {/* Donezo Top Search & Profile Bar */}
            <TopBar
              user={user}
              onOpenAuth={() => {}}
              alertsCount={alerts.length}
              activeItem={activeItem}
              profileImage={profileImage}
            />

            {/* Dynamic Route View Body */}
            <main className="flex-1 p-2 md:p-4 overflow-y-auto">

              {activeNav === 'dashboard' && (
                <DonezoDashboard
                  stats={stats}
                  alerts={alerts}
                  onIngestClick={() => setActiveNav('tasks')}
                  onSimulateClick={toggleSimulation}
                  onViewAlerts={() => setActiveNav('live')}
                />
              )}

              {activeNav === 'tasks' && (
                <MetricsStudioView onRefreshStats={loadInitialData} />
              )}

              {activeNav === 'live' && (
                <LiveStreamView
                  liveMetrics={liveMetrics}
                  thresholds={thresholds}
                  alerts={alerts}
                  clearAlerts={clearAlerts}
                  dismissAlert={dismissAlert}
                  isSimulating={isSimulating}
                  toggleSimulation={toggleSimulation}
                  simInterval={simInterval}
                  setSimInterval={setSimInterval}
                  breachRate={breachRate}
                  setBreachRate={setBreachRate}
                  simStats={simStats}
                />
              )}

              {activeNav === 'analytics' && (
                <AnalyticsView stats={stats} />
              )}

              {activeNav === 'team' && (
                <TeamView stats={stats} />
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
                  onOpenAuth={() => setIsAuthOpen(true)}
                  profileImage={profileImage}
                  setProfileImage={setProfileImage}
                />
              )}

            </main>

          </div>

        </div>
      } />
      <Route path="*" element={<AuthPage onAuthSuccess={() => { loadInitialData(); navigate("/"); }} />} />
    </Routes>
  );
}


function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}

export default AppWrapper;
