import React, { useState } from "react";
import {
  ChevronRight, LayoutGrid, Thermometer, Calendar, Search, Bell,
  Info, ArrowRight, Cpu, Gpu, MemoryStick, Database, Clock, Zap,
} from "lucide-react";
import { WelcomeBackdrop, WelcomeScene } from "./DashboardArt";
import { StatsChart } from "./StatsChart";
import { WELCOME, SEARCH_TARGETS, SYSTEM_INFO, GAUGES, WARN_COLORS } from "./dashboardData";

const CPU = GAUGES.find((g) => g.id === "cpu");

// --------------------------------------------------------------- welcome

function greetingFor(date) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function WindowsLogo() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <rect x="0" y="0" width="20" height="20" rx="3.5" />
      <rect x="24" y="0" width="20" height="20" rx="3.5" />
      <rect x="0" y="24" width="20" height="20" rx="3.5" />
      <rect x="24" y="24" width="20" height="20" rx="3.5" />
    </svg>
  );
}

/** The page a search query points at, or null: any query word that starts a target word counts. */
function searchTarget(query) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return null;
  const hit = SEARCH_TARGETS.find((t) => words.some((w) => t.words.some((tw) => tw.startsWith(w))));
  return hit ? hit.id : null;
}

function Welcome({ user, alertsCount, onNavigate }) {
  const now = new Date();
  const [query, setQuery] = useState("");
  const [missed, setMissed] = useState("");
  // The offline placeholder account has no real name, so it gets a plain greeting.
  const firstName = user?.id === "offline-user" ? "" : (user?.full_name || "").trim().split(/\s+/)[0];
  const { device } = WELCOME;
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <section className="ld-welcome" aria-label="Welcome">
      <WelcomeBackdrop />
      <div className="lw-scene-wrap"><WelcomeScene /></div>

      <nav className="lw-crumb" aria-label="Breadcrumb">
        <LayoutGrid strokeWidth={1.6} aria-hidden="true" />
        <ChevronRight strokeWidth={1.8} aria-hidden="true" />
        <span>Dashboard</span>
      </nav>

      <h1 className="lw-title">
        {greetingFor(now)}{firstName ? `, ${firstName}` : ""}!
        <span className="lw-wave" aria-hidden="true">
          👋
          <svg viewBox="0 0 80 80">
            <path d="M54 4l5 7M62 1l6 9" />
            <path d="M4 54l7 5M1 62l9 6" />
          </svg>
        </span>
      </h1>
      <p className="lw-sub">{WELCOME.subtitle}</p>

      <div className="lw-glass lw-device">
        <span className="lw-device-icon"><WindowsLogo /></span>
        <span className="lw-device-text">
          <b>{device.name}</b>
          <span>{device.detail}</span>
        </span>
        <i className="lw-divider" aria-hidden="true" />
        <span className="lw-status"><i aria-hidden="true" />{device.status}</span>
      </div>

      <div className="lw-glass lw-date">
        <Calendar strokeWidth={1.7} aria-hidden="true" />
        <time dateTime={now.toISOString().slice(0, 10)}>{today}</time>
      </div>

      <form
        className="lw-glass lw-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const target = searchTarget(query);
          if (target) {
            setMissed("");
            onNavigate?.(target);
          } else {
            setMissed(query.trim());
          }
        }}
      >
        <Search strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setMissed(""); }}
          placeholder={WELCOME.searchHint}
          aria-label="Search pages"
          aria-describedby={missed ? "lw-search-miss" : undefined}
        />
        {missed && (
          <span id="lw-search-miss" className="lw-search-miss" role="status">
            Nothing matches “{missed}”. Try CPU, alerts or devices.
          </span>
        )}
      </form>
      <button
        type="button"
        className="lw-glass lw-bell"
        onClick={() => onNavigate?.("live")}
        aria-label={alertsCount ? `Alerts (${alertsCount})` : "Alerts"}
        title="Alerts"
      >
        <Bell strokeWidth={1.9} />
        {alertsCount > 0 && <i aria-hidden="true" />}
      </button>

      <button type="button" className="lw-glass lw-chip-bars" onClick={() => onNavigate?.("analytics")} aria-label="Open Analytics" title="Analytics">
        <i /><i /><i />
      </button>
      <button
        type="button"
        className="lw-glass lw-chip-temp"
        onClick={() => onNavigate?.("sensors")}
        aria-label={`CPU temperature ${CPU.value}${CPU.unit}. Open Sensors`}
        title="CPU temperature"
      >
        <Thermometer strokeWidth={1.8} aria-hidden="true" />
        <b>{CPU.value}<small>{CPU.unit}</small></b>
      </button>
    </section>
  );
}

// ------------------------------------------------------ system information

const SYS_ICONS = { cpu: Cpu, gpu: Gpu, ram: MemoryStick, storage: Database, updated: Clock };

function formatUpdated(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function SystemInfo({ onOpenDevices }) {
  return (
    <section className="ld-sys" aria-labelledby="ld-sys-title">
      <header className="ls-head">
        <Info strokeWidth={2} aria-hidden="true" />
        <h2 id="ld-sys-title">System Information</h2>
        <button type="button" className="ls-link" onClick={onOpenDevices}>
          View device details
          <ArrowRight strokeWidth={2} aria-hidden="true" />
        </button>
      </header>
      <div className="ls-panels">
        {SYSTEM_INFO.map((rows, i) => (
          <dl key={i} className={`ls-panel ${i ? "is-right" : "is-left"}`}>
            {rows.map((row) => {
              const Icon = SYS_ICONS[row.icon];
              return (
                <div key={row.label} className="ls-row">
                  <span className="ls-icon" aria-hidden="true">
                    {Icon ? <Icon strokeWidth={2} /> : <WindowsLogo />}
                  </span>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.icon === "updated"
                      ? <time dateTime={row.value}>{formatUpdated(row.value)}</time>
                      : row.value}
                  </dd>
                </div>
              );
            })}
          </dl>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------- gauge cards

function GpuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M5.5 13.5l3.5-3.5 3 2 5.5-5.5V13.5Z" fill="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const GAUGE_ICONS = { cpu: Cpu, ram: MemoryStick, storage: Database };

function GaugeIcon({ id }) {
  if (id === "gpu") return <GpuIcon />;
  if (id === "power") return <Zap fill="currentColor" strokeWidth={1.5} aria-hidden="true" />;
  const Icon = GAUGE_ICONS[id];
  return <Icon strokeWidth={2} aria-hidden="true" />;
}

const TICKS = 30;
const SWEEP_FROM = 176; // degrees: the left end of the arc, a touch above level
const SWEEP_TO = 4;

const mix = (a, b, t) => {
  const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)).join(",")})`;
};

/** Semicircle of 30 ticks; the first `fill` share (0–1) is lit in the card's colours. */
function GaugeArc({ fill, colors, rest }) {
  const cx = 75.5;
  const cy = 108;
  const lit = Math.round(Math.min(1, Math.max(0, fill)) * TICKS);
  return (
    <svg className="lg-arc" viewBox="0 0 151 120" aria-hidden="true">
      {Array.from({ length: TICKS }, (_, i) => {
        const a = ((SWEEP_FROM - (i * (SWEEP_FROM - SWEEP_TO)) / (TICKS - 1)) * Math.PI) / 180;
        const on = i < lit;
        const t = on ? i / Math.max(1, lit - 1) : (i - lit) / Math.max(1, TICKS - lit - 1);
        const [c0, c1] = on ? colors : rest;
        return (
          <line
            key={i}
            x1={cx + 49.5 * Math.cos(a)} y1={cy - 49.5 * Math.sin(a)}
            x2={cx + 60.5 * Math.cos(a)} y2={cy - 60.5 * Math.sin(a)}
            stroke={mix(c0, c1, t)}
          />
        );
      })}
    </svg>
  );
}

function StatusBadge({ tone, text }) {
  return (
    <span className={`lg-badge is-${tone}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="8" />
        {tone === "warn"
          ? <path d="M8 4.2v4.6M8 11.2v.4" />
          : <path d="M4.6 8.2l2.2 2.2 4.4-4.6" />}
      </svg>
      {text}
    </span>
  );
}

function GaugeCard({ gauge, onMore }) {
  const { id, title, subtitle, value, max, unit, unitRaised, label, warnAt, okText, warnText } = gauge;
  const warn = value >= warnAt;
  const { colors, rest } = warn ? WARN_COLORS : gauge;
  const status = warn ? warnText : okText;
  return (
    <article className={`lg-card is-${id}`} aria-labelledby={`lg-${id}-title`}>
      <span className="lg-icon"><GaugeIcon id={id} /></span>
      <h3 className="lg-title" id={`lg-${id}-title`}>{title}</h3>
      <p className="lg-sub">{subtitle}</p>
      <StatusBadge tone={warn ? "warn" : "ok"} text={status} />
      <GaugeArc fill={value / max} colors={colors} rest={rest} />
      <div
        className="lg-value"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        aria-valuetext={`${value} ${unit}, ${status}`}
      >
        {value}
        <span className={unitRaised ? "is-raised" : undefined}>{unit}</span>
      </div>
      <div className="lg-label" aria-hidden="true">{label}</div>
      <button type="button" className="lg-more" onClick={onMore} aria-label={`View more about ${title}`}>
        View more <ArrowRight strokeWidth={2} aria-hidden="true" />
      </button>
    </article>
  );
}

function GaugeCards({ onNavigate }) {
  return (
    <section className="ld-gauges" aria-label="Hardware at a glance">
      {GAUGES.map((g) => (
        <GaugeCard key={g.id} gauge={g} onMore={() => onNavigate?.(g.more)} />
      ))}
    </section>
  );
}

// -------------------------------------------------------------- the view

export function Dashboard({ user, alertsCount = 0, onNavigate }) {
  return (
    <div className="ld-dash">
      <Welcome user={user} alertsCount={alertsCount} onNavigate={onNavigate} />
      <GaugeCards onNavigate={onNavigate} />
      <StatsChart />
      <SystemInfo onOpenDevices={() => onNavigate?.("devices")} />
    </div>
  );
}
