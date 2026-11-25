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
import { ConfirmDialog } from './components/ConfirmDialog';
import { AlertPopup } from './components/AlertPopup';
import { LogOut, PenLine } from 'lucide-react';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Landing from './pages/Landing';
import { PrivacyPage, TermsPage } from './pages/Legal';

import {
  fetchOpenAlertCount,
  ALERTS_CHANGED_EVENT,
  fetchCurrentUser,
  logoutUser,
  getAccessToken,
  hasSavedSession,
  restoreSession,
  AUTH_LOGOUT_EVENT,
} from './services/api';

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()));
  // The access token isn't stored, so a page load first trades the refresh
  // cookie for one. Until that answers, show nothing rather than flash the
  // public landing page at someone who is signed in.
  const [sessionChecked, setSessionChecked] = useState(() => Boolean(getAccessToken()) || !hasSavedSession());
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  // Which signed-in page is open, and the Dashboard's tab (the alert pop-up opens "Alerts").
  const [activeNav, setActiveNav] = useState('dashboard');
  const [dashboardTab, setDashboardTab] = useState('summary');

  // Settings reports unsaved edits here, so leaving the page asks first.
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const goTo = useCallback((id) => {
    if (settingsDirty && activeNav === 'settings' && id !== 'settings') {
      setPendingNav(id);
      return;
    }
    setActiveNav(id);
  }, [settingsDirty, activeNav]);

  // Sidebar mode: every page load opens the full sidebar; the toggle slims it
  // down to the icon rail for the rest of the visit.
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const toggleSidebar = useCallback(() => setSidebarExpanded((prev) => !prev), []);

  // Open alerts across all the user's PCs, for the bell in the header.
  const [openAlerts, setOpenAlerts] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    const load = () => fetchOpenAlertCount()
      .then((n) => { if (!cancelled) setOpenAlerts(n); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener(ALERTS_CHANGED_EVENT, load);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener(ALERTS_CHANGED_EVENT, load); };
  }, [isAuthenticated, activeNav]);

  // Load initial metadata
  const loadInitialData = useCallback(async () => {
    if (!(await restoreSession())) {
      setIsAuthenticated(false);
      setSessionChecked(true);
      return;
    }
    try {
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
      console.error('Error loading the signed-in user:', err);
    } finally {
      setSessionChecked(true);
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
    setSettingsDirty(false);
    navigate("/signin");
  };

  const activeItem = [...MAIN_ITEMS, ...OTHER_ITEMS].find((item) => item.id === activeNav) || MAIN_ITEMS[0];

  if (!sessionChecked) return null;

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
            setActiveNav={goTo}
            onLogout={() => setIsLogoutOpen(true)}
            user={user}
            expanded={sidebarExpanded}
            onToggle={toggleSidebar}
          />

          <div className="panel">
            <PageHeader title={activeItem.label} alertsCount={openAlerts} onNavigate={goTo} />

            <main className="page" aria-label={activeItem.label}>
              <Suspense fallback={<div className="empty" role="status">Loading…</div>}>
                {activeNav === 'dashboard' && <Dashboard onNavigate={goTo} tab={dashboardTab} onTabChange={setDashboardTab} />}

                {activeNav === 'devices' && <DevicesView />}

                {activeNav === 'metrics' && <MetricsStudioView onNavigate={goTo} />}

                {activeNav === 'live' && <LiveStreamView onNavigate={goTo} />}

                {activeNav === 'analytics' && <AnalyticsView onNavigate={goTo} />}

                {activeNav === 'sensors' && <SensorsView onNavigate={goTo} />}

                {activeNav === 'help' && <HelpView onNavigate={goTo} />}

                {activeNav === 'settings' && (
                  <SettingsView
                    user={user}
                    onUserUpdated={setUser}
                    onSignedOut={handleConfirmSignOut}
                    onDirtyChange={setSettingsDirty}
                  />
                )}
              </Suspense>
            </main>
          </div>


          <AlertPopup onSeeAll={() => { setDashboardTab('alerts'); goTo('dashboard'); }} />

          <ConfirmDialog
            open={isLogoutOpen}
            icon={LogOut}
            title="Sign out of Lectio?"
            confirmLabel="Sign out"
            busyLabel="Signing out…"
            onConfirm={handleConfirmSignOut}
            onCancel={() => setIsLogoutOpen(false)}
          >
            <p>Your PCs keep sending readings while you&apos;re away. Sign in again to see them.</p>
          </ConfirmDialog>

          <ConfirmDialog
            open={pendingNav !== null}
            icon={PenLine}
            title="Leave without saving?"
            confirmLabel="Leave page"
            cancelLabel="Keep editing"
            onConfirm={() => {
              setSettingsDirty(false);
              setActiveNav(pendingNav);
              setPendingNav(null);
            }}
            onCancel={() => setPendingNav(null)}
          >
            <p>You changed your name in Settings but didn&apos;t save it. If you leave now, the change is lost.</p>
          </ConfirmDialog>

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
