import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MAIN_ITEMS, OTHER_ITEMS } from './components/navItems';
import { PageHeader } from './components/ui';
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
} from './services/api';

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()));
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const [stats, setStats] = useState(null);
  const [thresholds, setThresholds] = useState({
    temperature: { max: 100 },
    cpu: { max: 90 },
    network: { max: 1000 },
  });

  // Which signed-in page is open.
  const [activeNav, setActiveNav] = useState('dashboard');

  // Sidebar mode: every page load opens the full sidebar; the toggle slims it
  // down to the icon rail for the rest of the visit.
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const toggleSidebar = useCallback(() => setSidebarExpanded((prev) => !prev), []);

  // WebSocket Hook
  const socket = useTelemetryWebSocket();
  const { liveMetrics, alerts, clearAlerts, dismissAlert } = socket;

  // Load initial metadata
  const loadInitialData = useCallback(async () => {
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
    if (!getAccessToken()) return;
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
                    status={socket.status === 'connected' ? 'live' : socket.status === 'connecting' ? 'connecting' : 'offline'}
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
