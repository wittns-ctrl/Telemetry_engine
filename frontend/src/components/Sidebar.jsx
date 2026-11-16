import React from 'react';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { LectioMark } from './LectioMark';
import { initialsFor } from './format';
import { MAIN_ITEMS, OTHER_ITEMS } from './navItems';

function NavButton({ item, active, onSelect, expanded }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={active ? 'on' : undefined}
      onClick={() => onSelect?.(item.id)}
      aria-label={expanded ? undefined : item.label}
      aria-current={active ? 'page' : undefined}
      title={expanded ? undefined : item.label}
    >
      <i aria-hidden="true"><Icon strokeWidth={1.9} /></i>
      {expanded && <span>{item.label}</span>}
    </button>
  );
}

/**
 * The app's black sidebar. Full: logo, labelled menu and the signed-in account.
 * Slim: the same items as an icon rail. The button beside the logo switches
 * between the two.
 */
export const Sidebar = ({ activeNav = 'dashboard', setActiveNav, onLogout, user, expanded = true, onToggle }) => {
  const name = user?.full_name || user?.email?.split('@')[0] || 'Account';
  const item = (it) => (
    <NavButton key={it.id} item={it} active={activeNav === it.id} onSelect={setActiveNav} expanded={expanded} />
  );
  const Toggle = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <aside className={`rail${expanded ? '' : ' is-slim'}`}>
      <div className="brand">
        <LectioMark size="calc(13 * var(--u))" on="dark" />
        {expanded && <span>Lectio</span>}
        {expanded && (
          <button type="button" className="rail-toggle" onClick={onToggle} aria-label="Collapse sidebar" title="Collapse sidebar">
            <Toggle strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
      </div>
      {!expanded && (
        <button type="button" className="rail-toggle" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar">
          <Toggle strokeWidth={1.9} aria-hidden="true" />
        </button>
      )}

      {expanded && <h2 className="cap">Main menu</h2>}
      <nav className="nav" aria-label="Main menu">{MAIN_ITEMS.map(item)}</nav>

      {expanded && <h2 className="cap">Others</h2>}
      <nav className="nav" aria-label="Others">{OTHER_ITEMS.map(item)}</nav>

      <div className="acct">
        {expanded && <h2 className="cap">User account</h2>}
        <div className="who">
          <button
            type="button"
            className="who-btn"
            onClick={() => setActiveNav?.('settings')}
            aria-label={`${name}: account settings`}
            title={expanded ? undefined : name}
          >
            <span className="ava" aria-hidden="true">{initialsFor(name)}</span>
            {expanded && (
              <span>
                <b>{name}</b>
                <small>Account settings</small>
              </span>
            )}
          </button>
          <button type="button" className="out-btn" onClick={onLogout} aria-label="Log out" title="Log out">
            <LogOut strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
};
