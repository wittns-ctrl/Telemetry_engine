import React, { useId, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ChevronDown, Download } from "lucide-react";
import {
  KPIS,
  TOTAL_SESSIONS,
  SPARKS,
  AREA_POINTS,
  AREA_MARKER,
  OVERVIEW_POINTS,
  OVERVIEW_DAYS,
  OVERVIEW_HIGHLIGHT,
  TOP_SESSIONS,
  BROWSER_VIEWS,
  STATS,
  REVENUE_SPARK,
} from "./dashboardData";

// ---------------------------------------------------------------- helpers

/** Smooth curve through the points (Catmull-Rom turned into cubic Béziers). */
function smoothPath(pts, closed = false) {
  const n = pts.length;
  if (n < 2) return "";
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const f = (v) => Math.round(v * 100) / 100;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}

/** Diamond centred on (cx, cy) with rounded corners. */
function roundedDiamond(cx, cy, r, round = 0.16) {
  const v = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  let d = "";
  v.forEach((p, i) => {
    const prev = v[(i + 3) % 4];
    const next = v[(i + 1) % 4];
    const a = [p[0] + (prev[0] - p[0]) * round, p[1] + (prev[1] - p[1]) * round];
    const b = [p[0] + (next[0] - p[0]) * round, p[1] + (next[1] - p[1]) * round];
    d += `${i ? "L" : "M"}${a[0]},${a[1]} Q${p[0]},${p[1]} ${b[0]},${b[1]} `;
  });
  return `${d}Z`;
}

function Change({ value, className = "" }) {
  const Arrow = value < 0 ? ArrowDown : ArrowUp;
  return (
    <span className={className}>
      <Arrow strokeWidth={2.4} aria-hidden="true" />
      {Math.abs(value)}%
    </span>
  );
}

// ------------------------------------------------------------------ KPIs

function Sparkline({ points, color }) {
  return (
    <svg className="qd-kpi-spark" viewBox="0 0 48 34" style={{ width: "calc(48 * var(--u))", height: "calc(34 * var(--u))" }} aria-hidden="true">
      <path d={smoothPath(points)} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TotalSessionsCard() {
  const id = useId();
  const line = smoothPath(AREA_POINTS);
  return (
    <div className="qd-kpi is-big">
      <div className="qd-kpi-area" aria-hidden="true">
        <svg viewBox="0 0 176 178" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5f4080" />
              <stop offset="1" stopColor="#3a3150" />
            </linearGradient>
            <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#c27ee6" />
              <stop offset="1" stopColor="#a98ef0" />
            </linearGradient>
          </defs>
          <path d={`${line} L176,178 L0,178 Z`} fill={`url(#${id}f)`} />
          <path d={line} fill="none" stroke={`url(#${id}l)`} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="qd-point" style={{ left: `${(AREA_MARKER.x / 176) * 100}%`, top: `calc(${AREA_MARKER.y} * var(--u))` }} />
        <span
          className="qd-callout is-sm"
          style={{ left: `${(AREA_MARKER.x / 176) * 100}%`, top: `calc(${AREA_MARKER.y - 17} * var(--u))` }}
        >
          <ArrowUp strokeWidth={2.6} aria-hidden="true" />
          {TOTAL_SESSIONS.change}%
        </span>
      </div>
      <div className="qd-kpi-label">{TOTAL_SESSIONS.label}</div>
      <div className="qd-kpi-value">{TOTAL_SESSIONS.value}</div>
    </div>
  );
}

function KpiRow() {
  return (
    <section className="qd-kpis" aria-label="Key figures">
      <TotalSessionsCard />
      {KPIS.map((k) => (
        <div key={k.label} className="qd-kpi">
          <div className="qd-kpi-label">{k.label}</div>
          <div className="qd-kpi-value">{k.value}</div>
          <Sparkline points={SPARKS[k.spark]} color={k.color} />
          <Change value={k.change} className="qd-kpi-change" />
        </div>
      ))}
    </section>
  );
}

// -------------------------------------------------------- sessions chart

const RANGES = [10, 7, 3];
const Y_TICKS = [300, 200, 100, 0];

function SessionsOverview() {
  const id = useId();
  const [days, setDays] = useState(10);
  const [hover, setHover] = useState(null);

  // Keep the last `days` labelled days and stretch them across the plot.
  const { points, ticks } = useMemo(() => {
    const first = OVERVIEW_DAYS[OVERVIEW_DAYS.length - days];
    const start = days === OVERVIEW_DAYS.length ? 0 : first.at - OVERVIEW_DAYS[0].at;
    const span = 1 - start;
    return {
      points: OVERVIEW_POINTS.filter(([x]) => x >= start).map(([x, v]) => [(x - start) / span, v]),
      ticks: OVERVIEW_DAYS.slice(-days).map((d) => ({ ...d, at: (d.at - start) / span })),
    };
  }, [days]);

  const perDay = Math.max(1, Math.round(points.length / (days + 0.25)));
  const nearest = (frac) =>
    points.reduce((best, p, i) => (Math.abs(p[0] - frac) < Math.abs(points[best][0] - frac) ? i : best), 0);

  // With nothing hovered, highlight 01 Ap as the reference does (or the latest day if it's out of range).
  const highlightDay = ticks.find((t) => t.label === "01 Ap");
  const defaultIndex = nearest(highlightDay ? highlightDay.at : 1);
  const index = hover ?? defaultIndex;
  const [hx, hv] = points[index];
  const prev = points[Math.max(0, index - perDay)][1];
  const change =
    hover === null && highlightDay ? OVERVIEW_HIGHLIGHT.change : Math.round(((hv - prev) / Math.max(prev, 1)) * 100);

  const line = smoothPath(points.map(([x, v]) => [x * 1000, 300 - v]));

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(nearest(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))));
  };

  const downloadCsv = () => {
    const rows = ticks.map((t) => `${t.date},${Math.round(points[nearest(t.at)][1])}`);
    const blob = new Blob([["date,sessions", ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sessions-last-${days}-days.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="qd-overview" aria-label="Sessions overview">
      <div className="qd-card-head">
        <h2 className="qd-card-title">Sessions Overview</h2>
        <div className="qd-card-tools">
          <label className="qd-select">
            <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setHover(null); }} aria-label="Date range">
              {RANGES.map((r) => <option key={r} value={r}>Last {r} days</option>)}
            </select>
            <ChevronDown strokeWidth={1.8} aria-hidden="true" />
          </label>
          <button type="button" className="qd-btn-white" onClick={downloadCsv}>
            <Download strokeWidth={2} aria-hidden="true" />
            Download CSV
          </button>
        </div>
      </div>

      <div className="qd-plot">
        {Y_TICKS.map((t) => (
          <span key={t} className="qd-ytick" style={{ top: `${100 - t / 3}%` }}>{t}</span>
        ))}
        {ticks.map((t, i) => (
          <span key={t.label} className={`qd-xtick${i % 2 ? " is-minor" : ""}`} style={{ left: `${t.at * 100}%` }}>{t.label}</span>
        ))}
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#c47ce6" />
              <stop offset="1" stopColor="#9b8ce8" />
            </linearGradient>
          </defs>
          {Y_TICKS.map((t) => (
            <line key={t} x1="0" x2="1000" y1={300 - t} y2={300 - t} stroke="#4b475b" strokeWidth="1" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <span className="qd-bar" style={{ left: `${hx * 100}%`, height: `${hv / 3}%` }} />
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
          <path d={line} fill="none" stroke={`url(#${id}l)`} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="qd-point" style={{ left: `${hx * 100}%`, top: `${100 - hv / 3}%` }} />
        <span className="qd-callout is-lg" style={{ left: `${hx * 100}%`, top: `calc(${100 - hv / 3}% - 12 * var(--u))` }}>
          {change < 0 ? <ArrowDown strokeWidth={2.4} aria-hidden="true" /> : <ArrowUp strokeWidth={2.4} aria-hidden="true" />}
          {Math.abs(change)}%
        </span>
        <div className="qd-plot-hit" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------- top sessions

const BRAND_ICONS = {
  chrome: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="3.8" />
      <path d="M21 8.2h-9M4 6.3l4.6 7.8M11 21.4l4.4-7.6" />
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5.6 10.4 4.5v7H3zM11.6 4.3 21 3v8.5h-9.4zM3 12.6h7.4v7L3 18.4zM11.6 12.6H21V21l-9.4-1.3z" />
    </svg>
  ),
  stack: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M5 14v6.5h13V14M8 17.6h7M8.3 14.6l6.9 1.3M9.2 11.7l6.4 2.7M10.8 9.1l5.6 4M13.1 6.8l4.3 5.1" />
    </svg>
  ),
};

function TopSessions() {
  return (
    <section className="qd-top-sessions" aria-label="Top sessions">
      <div className="qd-ts-intro">
        <h3>Top Sessions</h3>
        <p>Your website statistics for <b>1 week</b> period.</p>
      </div>
      {TOP_SESSIONS.map((s) => (
        <div key={s.name} className="qd-ts-card">
          <span className="qd-ts-icon" aria-hidden="true">{BRAND_ICONS[s.icon]}</span>
          <div className="qd-ts-name">{s.name}</div>
          <div className="qd-ts-sub">{s.sub}</div>
          <div className="qd-ts-value">{s.value} <small>/ Sessions</small></div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------- right column

function MoreButton({ label }) {
  return (
    <button type="button" className="qd-more" aria-label={label}>
      <span /><span /><span />
    </button>
  );
}

function BrowserRadar() {
  const id = useId();
  const cx = 131, cy = 118;
  const { labels, outline } = BROWSER_VIEWS;
  const step = 360 / outline.length;
  const blob = outline.map((r, i) => {
    const a = ((i * step - 90) * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

  const scale = [[0, 0], [10, 15], [20, 40], [30, 71], [40, 99]];

  return (
    <div className="qd-radar">
      <div className="qd-right-head">
        <h3>Views by Browser</h3>
        <MoreButton label="Views by browser options" />
      </div>
      <svg viewBox="0 0 262 236" role="img" aria-label="Views by browser: Explorer, Safari, Chrome and Firefox">
        <defs>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9a62b8" />
            <stop offset="0.55" stopColor="#6d4a8a" />
            <stop offset="1" stopColor="#5a4a86" />
          </linearGradient>
        </defs>
        <path d={roundedDiamond(cx, cy, 99, 0.13)} fill="#1e1c28" stroke="#77767d" strokeWidth="0.9" />
        <path d={smoothPath(blob, true)} fill={`url(#${id}b)`} opacity="0.9" />
        {[71, 41, 15].map((r) => (
          <path key={r} d={roundedDiamond(cx, cy, r, 0.16)} fill="none" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="0.9" />
        ))}
        <line x1={cx} x2={cx} y1={cy - 99} y2={cy + 99} stroke="#ffffff" strokeOpacity="0.06" strokeWidth="0.9" />
        <line x1={cx - 99} x2={cx + 99} y1={cy} y2={cy} stroke="#ffffff" strokeOpacity="0.06" strokeWidth="0.9" />
        {scale.map(([v, dy]) => (
          <text key={v} x={cx} y={cy + dy + 3} textAnchor="middle" fontSize="8.5" fill="#9b99a5">{v}</text>
        ))}
        <text x={cx} y={cy - 110} textAnchor="middle" fontSize="10.5" fill="#d0cfd6">{labels[0]}</text>
        <text x={cx + 118} y={cy + 4} textAnchor="middle" fontSize="10.5" fill="#d0cfd6">{labels[1]}</text>
        <text x={cx} y={cy + 115} textAnchor="middle" fontSize="10.5" fill="#d0cfd6">{labels[2]}</text>
        <text x={cx - 116} y={cy + 4} textAnchor="middle" fontSize="10.5" fill="#d0cfd6">{labels[3]}</text>
      </svg>
    </div>
  );
}

function Ring({ percent }) {
  const id = useId();
  const r = 24;
  const c = 2 * Math.PI * r;
  const end = ((percent / 100) * 360 - 90) * (Math.PI / 180);
  return (
    <svg viewBox="0 0 56 56" style={{ width: "calc(54 * var(--u))", height: "calc(54 * var(--u))" }} role="img" aria-label={`${percent}%`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c690ef" />
          <stop offset="1" stopColor="#8f74e6" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r={r} fill="none" stroke="#38373e" strokeWidth="2.6" />
      <circle
        cx="28" cy="28" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="2.6"
        strokeDasharray={`${(percent / 100) * c} ${c}`} transform="rotate(-90 28 28)"
      />
      <circle cx={28 + Math.cos(end) * r} cy={28 + Math.sin(end) * r} r="4.2" fill="#b98be6" />
      <text x="28" y="31.5" textAnchor="middle" fontSize="10" fill="#b48ae6">{percent}%</text>
    </svg>
  );
}

function RevenueSpark() {
  const id = useId();
  const line = smoothPath(REVENUE_SPARK);
  return (
    <svg viewBox="0 0 64 50" style={{ width: "calc(62 * var(--u))", height: "calc(48 * var(--u))" }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2fc38a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2fc38a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L60,50 L3,50 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="#2fc38a" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Statistics() {
  return (
    <div className="qd-stats">
      <div className="qd-right-head">
        <h3>Statistics</h3>
        <MoreButton label="Statistics options" />
      </div>
      <div className="qd-stat-list">
        {STATS.map((s, i) => (
          <div key={i} className="qd-stat">
            <div>
              <div className="qd-stat-name">{s.name}</div>
              <div className={`qd-stat-sub${s.kind === "spark" ? " is-up" : ""}`}>{s.sub}</div>
            </div>
            {s.kind === "ring" ? <Ring percent={s.percent} /> : <RevenueSpark />}
            <div className="qd-stat-value">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- the view

export function Dashboard() {
  return (
    <div className="qd-dash">
      <div className="qd-left">
        <KpiRow />
        <SessionsOverview />
        <TopSessions />
      </div>
      <aside className="qd-right">
        <BrowserRadar />
        <Statistics />
      </aside>
    </div>
  );
}
