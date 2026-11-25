import React, { useEffect, useRef, useState } from 'react';
import { LogOut, ChevronLeft, ChevronRight, ChevronDown, Menu, SlidersHorizontal, X } from 'lucide-react';
import { LectioMark } from './LectioMark';
import { initialsFor } from './format';
import { MAIN_ITEMS, ADVANCED_ITEMS, OTHER_ITEMS } from './navItems';

const ADVANCED_KEY = 'lectio-advanced-open';
const loadAdvanced = () => {
  try { return localStorage.getItem(ADVANCED_KEY) === '1'; } catch { return false; }
};
const saveAdvanced = (open) => {
  try { localStorage.setItem(ADVANCED_KEY, open ? '1' : '0'); } catch { /* not remembered */ }
};

// Below this width the sidebar is a top bar with a menu button (the narrow
// layout in app.css). What shows at each width is decided by CSS alone; this
// is only used to close the menu when the screen becomes wide.
const PHONE_QUERY = '(max-width: 860px)';

function NavButton({ item, active, onSelect, slim, count = 0 }) {
  const Icon = item.icon;
  const name = count ? `${item.label} (${count} open)` : item.label;
  return (
    <button
      type="button"
      className={active ? 'on' : undefined}
      onClick={() => onSelect?.(item.id)}
      aria-current={active ? 'page' : undefined}
      aria-label={slim || count ? name : undefined}
      title={slim ? name : undefined}
    >
      <i aria-hidden="true"><Icon strokeWidth={1.9} />{count > 0 && <em className="nav-dot" />}</i>
      {/* Hidden by CSS on the slim desktop rail, where aria-label names the button. */}
      <span>{item.label}</span>
      {count > 0 && <b className="nav-count" aria-hidden="true">{count}</b>}
    </button>
  );
}

/**
 * The app's black sidebar. Full: logo, labelled menu and the signed-in account.
 * Slim: the same items as an icon rail. The button beside the logo switches
 * between the two.
 *
 * On phones and small tablets it is a top bar with the logo and a menu button;
 * the button opens the full menu over the page.
 */
export const Sidebar = ({ activeNav = 'dashboard', setActiveNav, onLogout, user, expanded = true, onToggle, alertsCount = 0 }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  // The expert pages stay folded away unless opened (or one of them is showing).
  const [advancedOpen, setAdvancedOpen] = useState(loadAdvanced);
  const onAdvancedPage = ADVANCED_ITEMS.some((it) => it.id === activeNav);
  const showAdvanced = advancedOpen || onAdvancedPage;
  const toggleAdvanced = () => setAdvancedOpen((open) => { saveAdvanced(!open); return !open; });
  const closeBtnRef = useRef(null);

  // While open: Escape closes it, the page behind doesn't scroll, focus moves
  // into the menu (and back to the menu button on close), and the menu closes
  // itself if the screen becomes wide.
  useEffect(() => {
    if (!menuOpen) return undefined;
    closeBtnRef.current?.focus();
    const mq = window.matchMedia(PHONE_QUERY);
    const closeIfWide = () => { if (!mq.matches) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    // Scroll lock lives in app.css (html.menu-open), limited to phone widths.
    document.documentElement.classList.add('menu-open');
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', closeIfWide);
    window.addEventListener('resize', closeIfWide);
    return () => {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', closeIfWide);
      window.removeEventListener('resize', closeIfWide);
      document.documentElement.classList.remove('menu-open');
      // Back to the (newly rendered) open-menu button; absent if the app unmounted.
      document.querySelector('#app-menu .menu-btn')?.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  const go = (id) => {
    setActiveNav?.(id);
    setMenuOpen(false);
  };

  const slim = !expanded;
  const name = user?.full_name || user?.email?.split('@')[0] || 'Account';
  const item = (it) => (
    <NavButton key={it.id} item={it} active={activeNav === it.id} onSelect={go} slim={slim} count={it.id === 'alerts' ? alertsCount : 0} />
  );
  const Toggle = expanded ? ChevronLeft : ChevronRight;

  return (
    <aside
      id="app-menu"
      className={`rail${slim ? ' is-slim' : ''}${menuOpen ? ' is-open' : ''}`}
      role={menuOpen ? 'dialog' : undefined}
      aria-modal={menuOpen ? 'true' : undefined}
      aria-label={menuOpen ? 'Menu' : undefined}
    >
      <div className="brand">
        <LectioMark size="calc(13 * var(--u))" on="dark" />
        <span className="brand-name">Lectio</span>
        {expanded && (
          <button type="button" className="rail-toggle" onClick={onToggle} aria-label="Collapse sidebar" title="Collapse sidebar">
            <Toggle strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
        {/* Phone menu buttons; hidden by CSS on wider screens. */}
        {menuOpen ? (
          <button ref={closeBtnRef} type="button" className="menu-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="app-menu"
          >
            <Menu strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      {slim && (
        <button type="button" className="rail-toggle" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar">
          <Toggle strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}

      <h2 className="cap">Menu</h2>
      <nav className="nav" aria-label="Main menu">{MAIN_ITEMS.map(item)}</nav>

      <nav className="nav nav-adv" aria-label="Advanced">
        <button
          type="button"
          className="adv-toggle"
          onClick={toggleAdvanced}
          aria-expanded={showAdvanced}
          aria-controls="nav-advanced"
          aria-label={slim ? (showAdvanced ? 'Hide advanced pages' : 'Show advanced pages') : undefined}
          title={slim ? 'Advanced' : undefined}
        >
          <i aria-hidden="true"><SlidersHorizontal strokeWidth={1.9} /></i>
          <span>Advanced</span>
          <ChevronDown className={`adv-chev${showAdvanced ? ' up' : ''}`} strokeWidth={2} aria-hidden="true" />
        </button>
        <div id="nav-advanced" className="adv-items" hidden={!showAdvanced}>
          {ADVANCED_ITEMS.map(item)}
        </div>
      </nav>

      <nav className="nav nav-other" aria-label="Settings">{OTHER_ITEMS.map(item)}</nav>

      <div className="acct">
        <h2 className="cap">User account</h2>
        <div className="who">
          <button
            type="button"
            className="who-btn"
            onClick={() => go('settings')}
            aria-label={`${name}: account settings`}
            title={slim ? name : undefined}
          >
            <span className="ava" aria-hidden="true">{initialsFor(name)}</span>
            <span className="who-text">
              <b>{name}</b>
              <small>Account settings</small>
            </span>
          </button>
          <button type="button" className="out-btn" onClick={() => { setMenuOpen(false); onLogout?.(); }} aria-label="Log out" title="Log out">
            <LogOut strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
};
