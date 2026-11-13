import React, { useState } from "react";
import { ArrowUpRight, ChevronRight, LayoutGrid, Thermometer, Gauge, Activity } from "lucide-react";
import { TopBar } from "./TopBar";
import { HeroScene, HealthScene, ThermalBoard } from "./DashboardArt";
import {
  HERO,
  TEMP_WAVES,
  STATS,
  DAY_STATUS,
  READINGS,
  HEALTH_TAGS,
  THERMAL,
  USAGE_SERIES,
  USAGE,
} from "./dashboardData";

const PERIODS = ["Week", "Last week"];
const nextOf = (list, current) => list[(list.indexOf(current) + 1) % list.length];

function PeriodPill({ value, onChange }) {
  return (
    <button type="button" className="ld-pill" onClick={() => onChange(nextOf(PERIODS, value))} title="Switch period">
      {value}
      <ChevronRight strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function Legend({ items }) {
  return (
    <div className="ld-legend">
      {items.map((it) => (
        <span key={it.label}><i style={{ background: it.color }} />{it.label}</span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ hero

function Hero({ alertsCount, onOpenAlerts, onOpen }) {
  const { load, temp } = HERO;
  const wave = (pts) => pts.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <section className="ld-hero" aria-label="Overview">
      <div className="ld-crumb"><LayoutGrid strokeWidth={1.8} aria-hidden="true" />Dashboard</div>
      <h1>{HERO.title[0].toUpperCase()}<br />{HERO.title[1].toUpperCase()}</h1>
      <div className="ld-hero-sub">{HERO.subtitle}</div>

      <div className="ld-hero-cards">
        <div className="ld-glass ld-hero-card is-first">
          <div className="ld-hero-card-label">{load.label[0]}<br />{load.label[1]}</div>
          <button type="button" className="ld-arrow-btn" onClick={() => onOpen("devices")} aria-label="Open My Devices">
            <ArrowUpRight strokeWidth={2} />
          </button>
          <div className="ld-hero-card-value">{load.value}<small> {load.unit}</small></div>
          <div className="ld-meter">
            <div className="ld-meter-labels"><span>{load.from}</span><span>{load.to}</span></div>
            <div className="ld-meter-track" role="meter" aria-valuenow={load.value} aria-valuemin={0} aria-valuemax={100} aria-label="CPU load">
              <div className="ld-meter-fill" style={{ width: `${Math.max(18, load.value * 0.55)}%` }} />
            </div>
          </div>
        </div>

        <div className="ld-glass ld-hero-card is-second">
          <div className="ld-hero-card-label">{temp.label[0]}<br />{temp.label[1]}</div>
          <button type="button" className="ld-arrow-btn" onClick={() => onOpen("live")} aria-label="Open Live Stream">
            <ArrowUpRight strokeWidth={2} />
          </button>
          <div className="ld-hero-card-value">{temp.value}<small>{temp.unit}</small></div>
          <svg className="ld-hero-wave" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={wave(TEMP_WAVES.gpu)} fill="none" stroke="#1c1c1f" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <polyline points={wave(TEMP_WAVES.cpu)} fill="none" stroke="#5cc061" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>

      <div className="ld-hero-art"><HeroScene /></div>

      <TopBar alertsCount={alertsCount} onOpenAlerts={onOpenAlerts} />

      <div className="ld-glass ld-hero-kpis">
        {HERO.kpis.map((k) => (
          <div key={k.label}>
            <b>{k.value}<small>{k.unit}</small></b>
            <span>{k.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ----------------------------------------------------------- stat cards

const STAT_ICONS = { temp: Thermometer, gpu: Gauge, readings: Activity };

function StatCards() {
  return (
    <section className="ld-stats" aria-label="Key figures">
      {STATS.map((s) => {
        const Icon = STAT_ICONS[s.icon];
        return (
          <div key={s.label} className="ld-card ld-stat">
            <span className="ld-stat-icon"><Icon strokeWidth={1.6} aria-hidden="true" /></span>
            <div>
              <div className="ld-stat-value">
                {s.value}
                {s.unit && <sup>{s.unit}</sup>}
                <span className={`ld-badge ${s.good ? "is-up" : "is-down"}`}>{s.change}</span>
              </div>
              <div className="ld-stat-label">{s.label}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ------------------------------------------------- readings lollipop chart

const MAX_READINGS = 3000;
const PLOT_H = 123; // reference px from 0 to the top gridline
const Y_LABELS = [[3000, "Qty"], [2000, "2k"], [1000, "1k"], [0, "0"]];

function ReadingsChart() {
  const [period, setPeriod] = useState("Week");
  const data = READINGS[period];
  const peakIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const [hover, setHover] = useState(null);
  const active = hover ?? peakIndex;
  const top = (v) => PLOT_H - (v / MAX_READINGS) * PLOT_H;

  return (
    <section className="ld-card ld-readings" aria-label="Readings received">
      <div className="ld-readings-head">
        <h2 className="ld-card-title">Readings Received</h2>
        <PeriodPill value={period} onChange={(p) => { setPeriod(p); setHover(null); }} />
      </div>
      <p>Daily overview of hardware readings received from all your PCs.</p>
      <Legend items={Object.values(DAY_STATUS)} />

      <div className="ld-lolli">
        <div className="ld-lolli-grid">
          {[0, 500, 1000, 1500, 2000, 2500, 3000].map((v) => (
            <i key={v} style={{ top: `calc(${top(v)} * var(--u))` }} />
          ))}
        </div>
        {Y_LABELS.map(([v, label]) => (
          <span key={v} className="ld-lolli-y" style={{ top: `calc(${top(v)} * var(--u))` }}>{label}</span>
        ))}
        <span className="ld-lolli-date">Date</span>
        <div className="ld-lolli-cols" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => {
            const isActive = i === active;
            const y = top(d.value);
            return (
              <div
                key={d.day}
                className={`ld-lolli-col${isActive ? " is-active" : ""}`}
                onMouseEnter={() => setHover(i)}
                title={`${d.day}: ${d.value.toLocaleString()} readings (${DAY_STATUS[d.status].label})`}
              >
                <span className="ld-lolli-glow" style={{ top: `calc(${y - 5} * var(--u))` }} />
                <span className="ld-lolli-stem" style={{ height: `calc(${PLOT_H - y} * var(--u))` }} />
                <span className="ld-lolli-dot" style={{ top: `calc(${y} * var(--u))`, background: isActive ? "#5cc061" : DAY_STATUS[d.status].color }} />
                {isActive && (
                  <span className="ld-lolli-tip" style={{ top: `calc(${y} * var(--u))` }}>{d.value.toLocaleString()}</span>
                )}
                <span className="ld-lolli-day">{d.day}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------- device health + thermal

function DeviceHealth() {
  return (
    <section className="ld-card" aria-label="Device health">
      <div className="ld-card-head">
        <h3 className="ld-card-title">Device Health</h3>
        <button type="button" className="ld-more" aria-label="Device health options"><span /><span /><span /></button>
      </div>
      <div className="ld-health-art">
        <HealthScene />
        {HEALTH_TAGS.map((t) => (
          <span
            key={t.label}
            className="ld-tag"
            style={{
              left: `${(t.x / 150) * 100}%`,
              top: `${(t.y / 108) * 100}%`,
              transform: t.align === "above" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="ld-health-status">
        Status
        <b>Active <i aria-hidden="true" /></b>
      </div>
    </section>
  );
}

function ThermalMap() {
  const [index, setIndex] = useState(0);
  const t = THERMAL[index];
  return (
    <section className="ld-card" aria-label="Thermal map">
      <div className="ld-card-head">
        <h3 className="ld-card-title">Thermal Map</h3>
        <button type="button" className="ld-pill" onClick={() => setIndex((index + 1) % THERMAL.length)} title="Next device">
          {t.device}
          <ChevronRight strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="ld-thermal">
        <ThermalBoard hot={t.hot} />
        <div className="ld-thermal-tip">
          <div>
            <b>{t.part}</b>
            <span>{t.level}</span>
          </div>
          <strong>{t.percent}%</strong>
        </div>
        <button type="button" className="ld-help-dot" aria-label="Brighter parts are running hotter" title="Brighter parts are running hotter">?</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------- usage bars

function ResourceUsage() {
  const [period, setPeriod] = useState("Week");
  return (
    <section className="ld-card ld-usage" aria-label="Resource usage">
      <div className="ld-card-head">
        <h3 className="ld-card-title">Resource Usage</h3>
        <PeriodPill value={period} onChange={setPeriod} />
      </div>
      <Legend items={USAGE_SERIES} />
      <div className="ld-bars">
        {USAGE[period].map((d) => (
          <div key={d.day} className="ld-bar" title={USAGE_SERIES.map((s) => `${s.label} ${Math.round(d[s.key] * 2)}%`).join(" · ")}>
            {[...USAGE_SERIES].reverse().map((s) => (
              <i key={s.key} style={{ height: `calc(${d[s.key]} * var(--u))`, background: s.color }} />
            ))}
            <span>{d.day}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// -------------------------------------------------------------- the view

export function Dashboard({ alertsCount = 0, onNavigate }) {
  return (
    <div className="ld-dash">
      <Hero alertsCount={alertsCount} onOpenAlerts={() => onNavigate?.("live")} onOpen={(id) => onNavigate?.(id)} />
      <div className="ld-col">
        <StatCards />
        <ReadingsChart />
      </div>
      <div className="ld-col">
        <div className="ld-pair">
          <DeviceHealth />
          <ThermalMap />
        </div>
        <ResourceUsage />
      </div>
    </div>
  );
}
