import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MAIN_ITEMS, OTHER_ITEMS } from './components/navItems';
import { PageHeader } from './components/ui';
import { sampleLive } from './components/sampleData';
import './components/app.css';

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

import { useTelemetryWebSocket } from './hooks/useTelemetryWebSocket';
import {
  fetchStats,
  fetchThresholds,
  fetchCurrentUser,
  logoutUser,
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

  const simTimerRef = useRef(null);

  // WebSocket Hook
  const socket = useTelemetryWebSocket();

  // Frontend-only mode has no socket, so the simulator feeds Live Monitor from
  // here instead: readings and alerts are kept in this state and never sent.
  const [offlineLive, setOfflineLive] = useState(() => (BACKEND_DISABLED ? sampleLive() : null));
  const liveMetrics = offlineLive ? offlineLive.metrics : socket.liveMetrics;
  const alerts = offlineLive ? offlineLive.alerts : socket.alerts;
  const clearAlerts = offlineLive ? () => setOfflineLive((prev) => ({ ...prev, alerts: [] })) : socket.clearAlerts;
  const dismissAlert = offlineLive
    ? (id) => setOfflineLive((prev) => ({ ...prev, alerts: prev.alerts.filter((a) => a.id !== id) }))
    : socket.dismissAlert;

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

  // Keep the stored-reading totals current: refetch them when a page that
  // shows them opens and whenever a new reading arrives over the socket.
  const latestMetricId = socket.latestMetric?.id;
  useEffect(() => {
    if (BACKEND_DISABLED || !getAccessToken()) return;
    if (!['metrics', 'analytics', 'sensors'].includes(activeNav)) return;
    let cancelled = false;
    fetchStats()
      .then((data) => { if (!cancelled && data) setStats(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeNav, latestMetricId]);

  // api.js fires this when a refresh fails and the session is cleared.
  useEffect(() => {
    const onLoggedOut = () => {
      setUser(null);
      setIsAuthenticated(false);
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLoggedOut);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLoggedOut);
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setIsAuthenticated(true);
    loadInitialData();
    navigate("/");
  }, [loadInitialData, navigate]);

  // Frontend-only mode: a made-up reading, over its limit about one time in five.
  const generateSimulatedPayload = useCallback(() => {
    const sensors = ['sensor_server_101', 'sensor_edge_node_4', 'sensor_db_cluster_a', 'sensor_gateway_01'];
    const sensor_id = sensors[Math.floor(Math.random() * sensors.length)];

    const metricTypes = ['temperature', 'cpu', 'network'];
    const metric_type = metricTypes[Math.floor(Math.random() * metricTypes.length)];

    const shouldBreach = Math.random() < 0.2;

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
  }, [thresholds]);

  // Frontend-only mode has no live stream, so while Live Monitor is open a
  // reading is made up every second. Nothing is sent anywhere. With the backend
  // connected, real readings arrive over the socket and this never runs.
  useEffect(() => {
    if (!BACKEND_DISABLED || activeNav !== 'live') return undefined;
    const UNITS = { temperature: "°C", cpu: "%", network: " MB/s" };
    const NAMES = { temperature: "Temperature", cpu: "CPU usage", network: "Network throughput" };
    simTimerRef.current = setInterval(() => {
      const { sensor_id, metric_type, value, ...payload_data } = generateSimulatedPayload();
      const limit = thresholds?.[metric_type]?.max;
      const breached = limit !== undefined && value > limit;
      const now = new Date();
      const id = `${now.getTime()}-${Math.random().toString(36).substring(2, 7)}`;
      const point = {
        id, sensor_id, metric_type, value, payload_data,
        timestamp: now.toISOString(),
        alert_triggered: breached,
        timeLabel: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
      const unit = UNITS[metric_type];
      const alert = breached && {
        id, receivedAt: point.timestamp, severity: "CRITICAL", sensor_id, metric_type,
        message: `${NAMES[metric_type]} ${value}${unit} is above the ${limit}${unit} limit.`,
        current_value: value, threshold_max: limit, unit,
      };
      setOfflineLive((prev) => ({
        metrics: [...prev.metrics, point].slice(-60),
        alerts: alert ? [alert, ...prev.alerts].slice(0, 100) : prev.alerts,
      }));
    }, 1000);
    return () => clearInterval(simTimerRef.current);
  }, [activeNav, generateSimulatedPayload, thresholds]);

  const handleConfirmSignOut = async () => {
    await logoutUser();
    setUser(null);
    setIsAuthenticated(false);
    setIsLogoutOpen(false);
    navigate("/signin");
  };

  const activeItem = [...MAIN_ITEMS, ...OTHER_ITEMS].find((item) => item.id === activeNav) || MAIN_ITEMS[0];

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
        <div className="ld-frame">
          <Sidebar
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            onLogout={() => setIsLogoutOpen(true)}
            user={user}
            expanded={sidebarExpanded}
            onToggle={toggleSidebar}
          />

          <div className="panel">
            <PageHeader title={activeItem.label} alertsCount={alerts.length} onNavigate={setActiveNav} />

            <main className="page" aria-label={activeItem.label}>
              <Suspense fallback={<div className="empty" role="status">Loading…</div>}>
                {activeNav === 'dashboard' && <Dashboard onNavigate={setActiveNav} />}

                {activeNav === 'devices' && <DevicesView />}

                {activeNav === 'metrics' && <MetricsStudioView stats={stats} onRefreshStats={loadInitialData} />}

                {activeNav === 'live' && (
                  <LiveStreamView
                    liveMetrics={liveMetrics}
                    thresholds={thresholds}
                    alerts={alerts}
                    clearAlerts={clearAlerts}
                    dismissAlert={dismissAlert}
                    status={BACKEND_DISABLED ? 'live' : socket.status === 'connected' ? 'live' : socket.status === 'connecting' ? 'connecting' : 'offline'}
                  />
                )}

                {activeNav === 'analytics' && <AnalyticsView stats={stats} thresholds={thresholds} onNavigate={setActiveNav} />}

                {activeNav === 'sensors' && <SensorsView stats={stats} />}

                {activeNav === 'help' && <HelpView onNavigate={setActiveNav} />}

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
