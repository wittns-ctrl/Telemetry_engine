import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import './components/dashboard.css';

// The signed-in screens (and the charts library they use) load only when opened,
// so landing-page visitors don't download the whole dashboard up front.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Dashboard = named(() => import('./components/Dashboard'), 'Dashboard');
const MetricsStudioView = named(() => import('./components/MetricsStudioView'), 'MetricsStudioView');
const LiveStreamView = named(() => import('./components/LiveStreamView'), 'LiveStreamView');
const AnalyticsView = named(() => import('./components/AnalyticsView'), 'AnalyticsView');
const SensorsView = named(() => import('./components/SensorsView'), 'SensorsView');
const HelpView = named(() => import('./components/HelpView'), 'HelpView');
const SettingsView = named(() => import('./components/SettingsView'), 'SettingsView');
const DevicesView = named(() => import('./components/DevicesView'), 'DevicesView');
import { AuthPage } from './components/AuthPage';
import { AuthModal } from './components/AuthModal';
import { LogoutModal } from './components/LogoutModal';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Landing from './pages/Landing';
import { PrivacyPage, TermsPage } from './pages/Legal';
import { LayoutGrid, Database, Radio, BarChart3, Cpu, Server, Settings, HelpCircle } from 'lucide-react';

import { useTelemetryWebSocket } from './hooks/useTelemetryWebSocket';
import {
  fetchStats,
  fetchThresholds,
  fetchCurrentUser,
  logoutUser,
  ingestMetric,
  getAccessToken,
  AUTH_LOGOUT_EVENT,
  BACKEND_DISABLED,
  OFFLINE_USER,
} from './services/api';

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => (BACKEND_DISABLED ? OFFLINE_USER : null));
  const [isAuthenticated, setIsAuthenticated] = useState(() => BACKEND_DISABLED || Boolean(getAccessToken()));
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const [stats, setStats] = useState(null);
  const [thresholds, setThresholds] = useState({
    temperature: { max: 100 },
    cpu: { max: 90 },
    network: { max: 1000 },
  });

  // Navigation state ('dashboard' default as shown in Donezo design)
  const [activeNav, setActiveNav] = useState('dashboard');

  // Sidebar mode: every page load opens the full sidebar; the toggle slims it
  // down to the icon rail for the rest of the visit.
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const toggleSidebar = useCallback(() => setSidebarExpanded((prev) => !prev), []);

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
    if (BACKEND_DISABLED) {
      setUser(OFFLINE_USER);
      return;
    }
    if (!getAccessToken()) return;
    try {
      const [statsData, thresholdsData] = await Promise.all([
        fetchStats().catch(() => null),
        fetchThresholds().catch(() => null),
      ]);
      if (statsData) setStats(statsData);
      if (thresholdsData) setThresholds(thresholdsData);

      const currentUser = await fetchCurrentUser().catch(() => null);
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
      } else if (!getAccessToken()) {
        // Token was rejected and could not be refreshed.
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Error loading initial telemetry metadata:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // api.js fires this when a refresh fails and the session is cleared.
  useEffect(() => {
    const onLoggedOut = () => {
      setUser(null);
      setIsAuthenticated(false);
      setIsSimulating(false);
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLoggedOut);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLoggedOut);
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setIsAuthenticated(true);
    loadInitialData();
    navigate("/");
  }, [loadInitialData, navigate]);

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
    if (isSimulating && !BACKEND_DISABLED) {
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

  const handleConfirmSignOut = async () => {
    await logoutUser();
    setUser(null);
    setIsAuthenticated(false);
    setIsLogoutOpen(false);
    setIsSimulating(false);
    navigate("/signin");
  };

  const toggleSimulation = () => {
    setIsSimulating((prev) => !prev);
  };

  // Define menu items for lookup
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "devices", label: "My Devices", icon: Cpu },
    { id: "metrics", label: "Metrics Studio", icon: Database },
    { id: "live", label: "Live Stream", icon: Radio },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "sensors", label: "Sensors", icon: Server },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "help", label: "Help", icon: HelpCircle },
  ];

  const activeItem = menuItems.find(item => item.id === activeNav) || menuItems[0];

  // Show full-page auth routes
  return (
    <Routes>
      <Route path="/signin" element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage onAuthSuccess={handleAuthSuccess} />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage key="signup" initialScreen="signup" onAuthSuccess={handleAuthSuccess} />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/" element={!isAuthenticated ? <Landing /> : (
        <div className={`ld-frame${sidebarExpanded ? ' is-wide' : ''}`}>
          <Sidebar
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            onLogout={() => setIsLogoutOpen(true)}
            user={user}
            expanded={sidebarExpanded}
            onToggle={toggleSidebar}
          />

          <div className="ld-content">
            {activeNav !== 'dashboard' && (
              <TopBar alertsCount={alerts.length} onOpenAlerts={() => setActiveNav('live')} />
            )}

            <main className="ld-page" aria-label={activeItem.label}>
              <Suspense fallback={<div className="p-6 text-sm text-slate-400" role="status">Loading…</div>}>

              {activeNav === 'dashboard' && <Dashboard alertsCount={alerts.length} onNavigate={setActiveNav} />}

              {activeNav === 'devices' && (
                <DevicesView />
              )}

              {activeNav === 'metrics' && (
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

              {activeNav === 'sensors' && (
                <SensorsView stats={stats} />
              )}

              {activeNav === 'help' && (
                <HelpView onNavigate={setActiveNav} />
              )}

              {activeNav === 'settings' && (
                <SettingsView
                  user={user}
                  onUserUpdated={setUser}
                  onSignedOut={handleConfirmSignOut}
                />
              )}
              </Suspense>

            </main>

          </div>

          {/* Authentication Modal */}
          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
            onAuthSuccess={() => {
              setIsAuthenticated(true);
              loadInitialData();
              setIsAuthOpen(false);
            }}
          />

          {/* Logout Confirmation Modal */}
          <LogoutModal
            isOpen={isLogoutOpen}
            onClose={() => setIsLogoutOpen(false)}
            onConfirm={handleConfirmSignOut}
          />

        </div>
      )} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
