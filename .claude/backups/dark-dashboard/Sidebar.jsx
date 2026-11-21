import React from 'react';
import { Cpu, Database, Radio, ChartSpline, Server, Settings, Headset, LogOut } from 'lucide-react';
import { LectioMark } from './LectioMark';

// Filled four-block tile used for the Dashboard item.
function DashboardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <rect x="2" y="2" width="9" height="11" rx="1.6" />
      <rect x="13" y="2" width="9" height="7" rx="1.6" />
      <rect x="2" y="15" width="9" height="7" rx="1.6" />
      <rect x="13" y="11" width="9" height="11" rx="1.6" />
    </svg>
  );
}

// Item ids must match the views rendered in App.jsx.
const MAIN_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
  { id: 'devices', label: 'My Devices', icon: Cpu },
  { id: 'metrics', label: 'Metrics Studio', icon: Database },
  { id: 'live', label: 'Live Stream', icon: Radio },
  { id: 'analytics', label: 'Analytics', icon: ChartSpline },
  { id: 'sensors', label: 'Sensors', icon: Server },
];

const GENERAL_ITEMS = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'help', label: 'Help', icon: Headset },
];

function NavButton({ item, active, onSelect }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`qd-side-item${active ? ' is-active' : ''}`}
      onClick={() => onSelect?.(item.id)}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      title={item.label}
    >
      <Icon strokeWidth={1.5} />
    </button>
  );
}

export const Sidebar = ({ activeNav = 'dashboard', setActiveNav, onLogout }) => (
  <aside className="qd-side">
    <div className="qd-side-logo">
      <LectioMark size={32} tone="violet" />
    </div>

    <nav className="qd-side-nav" aria-label="Main">
      {MAIN_ITEMS.map((item) => (
        <NavButton key={item.id} item={item} active={activeNav === item.id} onSelect={setActiveNav} />
      ))}
      <div className="qd-side-divider" aria-hidden="true"><span /></div>
      {GENERAL_ITEMS.map((item) => (
        <NavButton key={item.id} item={item} active={activeNav === item.id} onSelect={setActiveNav} />
      ))}
    </nav>

    <button type="button" className="qd-side-item qd-side-logout" onClick={onLogout} aria-label="Log out" title="Log out">
      <LogOut strokeWidth={1.5} />
    </button>
  </aside>
);
