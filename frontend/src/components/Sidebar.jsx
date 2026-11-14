import React from 'react';
import {
  LayoutGrid, Cpu, Database, Radio, ChartSpline, Server, Headset, Settings, LogOut,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { LectioMark } from './LectioMark';

// Item ids must match the views rendered in App.jsx.
const MAIN_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'devices', label: 'My Devices', icon: Cpu },
  { id: 'metrics', label: 'Metrics Studio', icon: Database },
  { id: 'live', label: 'Live Stream', icon: Radio },
  { id: 'analytics', label: 'Analytics', icon: ChartSpline },
  { id: 'sensors', label: 'Sensors', icon: Server },
];

const OTHER_ITEMS = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'help', label: 'Help', icon: Headset },
];

function initialsFor(name) {
  const base = (name || '').split('@')[0].trim();
  if (!base) return '?';
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2)).toUpperCase();
}

function NavButton({ item, active, onSelect, expanded }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`ld-rail-btn${active ? ' is-active' : ''}`}
      onClick={() => onSelect?.(item.id)}
      aria-label={expanded ? undefined : item.label}
      aria-current={active ? 'page' : undefined}
      title={expanded ? undefined : item.label}
    >
      <Icon strokeWidth={1.7} aria-hidden="true" />
      {expanded && <span className="ld-rail-label">{item.label}</span>}
    </button>
  );
}

/**
 * The app's sidebar. Slim: a dark icon rail. Full: the same rail widened with
 * labels, section headings and the signed-in account. A round glass chevron
 * button switches between the two.
 */
export const Sidebar = ({ activeNav = 'dashboard', setActiveNav, onLogout, user, expanded = false, onToggle }) => {
  const name = user?.full_name || user?.email?.split('@')[0] || 'Account';
  const email = user?.email || '';
  const item = (it) => (
    <NavButton key={it.id} item={it} active={activeNav === it.id} onSelect={setActiveNav} expanded={expanded} />
  );

  if (!expanded) {
    return (
      <aside className="ld-rail">
        <span className="ld-logo"><LectioMark size={20} /></span>
        <button type="button" className="ld-glass-toggle ld-rail-toggle" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar">
          <ChevronRight strokeWidth={2.2} />
        </button>

        <nav className="ld-rail-nav" aria-label="Main">{MAIN_ITEMS.map(item)}</nav>

        <div className="ld-rail-bottom">
          {[...OTHER_ITEMS].reverse().map(item)}
          <button type="button" className="ld-rail-btn" onClick={onLogout} aria-label="Log out" title="Log out">
            <LogOut strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className="ld-rail-avatar"
            onClick={() => setActiveNav?.('settings')}
            aria-label={`${name} — account settings`}
            title={name}
          >
            {initialsFor(name)}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="ld-rail is-expanded">
      <div className="ld-rail-brand">
        <span className="ld-logo"><LectioMark size={20} /></span>
        <span className="ld-rail-brand-name">Lectio</span>
        <button type="button" className="ld-glass-toggle" onClick={onToggle} aria-label="Collapse sidebar" title="Collapse sidebar">
          <ChevronLeft strokeWidth={2.2} />
        </button>
      </div>

      <nav className="ld-rail-section" aria-label="Main menu">
        <h2 className="ld-rail-heading">Main menu</h2>
        {MAIN_ITEMS.map(item)}
      </nav>

      <nav className="ld-rail-section" aria-label="Others">
        <h2 className="ld-rail-heading">Others</h2>
        {OTHER_ITEMS.map(item)}
      </nav>

      <div className="ld-rail-account">
        <button type="button" className="ld-rail-profile" onClick={() => setActiveNav?.('settings')} title="Account settings">
          <span className="ld-rail-avatar" aria-hidden="true">{initialsFor(name)}</span>
          <span className="ld-rail-who">
            <b>{name}</b>
            {email && <small>{email}</small>}
          </span>
        </button>
        <button type="button" className="ld-rail-btn" onClick={onLogout}>
          <LogOut strokeWidth={1.7} aria-hidden="true" />
          <span className="ld-rail-label">Log out</span>
        </button>
      </div>
    </aside>
  );
};
