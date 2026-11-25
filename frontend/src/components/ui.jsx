import React, { useEffect, useId, useRef, useState } from "react";
import { Search, Bell, X } from "lucide-react";
import { cx, fmt } from "./format";
import { fetchDevices } from "../services/api";
import { GROUPS } from "./readings";
import { ALL_PAGES } from "./navItems";

// Shared pieces of the signed-in app: the page header, cards, pills, the line
// graph and the dialog. Styles live in app.css.

// ------------------------------------------------------------ page header

// What the header search finds: the user's PCs by name, the open alerts,
// readings (opening that part of the dashboard) and pages. Matching is by the
// start of any word, so "temp", "drive" or "office" all work.
const PAGE_WORDS = {
  dashboard: ["home", "dashboard", "overview", "summary", "health", "status"],
  devices: ["pc", "pcs", "computer", "device", "devices", "machine", "agent", "download", "install", "add"],
  help: ["help", "support", "faq", "guide", "question", "how"],
  live: ["live", "monitor", "real", "time", "stream"],
  analytics: ["analytics", "trend", "trends", "history", "week", "month"],
  sensors: ["sensor", "sensors"],
  metrics: ["metric", "metrics", "studio", "raw", "data", "ingest"],
  settings: ["setting", "settings", "account", "profile", "password", "email", "notification", "notifications"],
};
const GROUP_WORDS = {
  cpu: ["cpu", "processor", "temperature", "temp", "hot", "heat", "fan", "speed", "busy", "load"],
  gpu: ["gpu", "graphics", "video", "card", "vram"],
  ram: ["ram", "memory", "errors", "whea", "pagefile"],
  storage: ["storage", "disk", "drive", "ssd", "nvme", "space", "full", "smart"],
  board: ["power", "supply", "psu", "voltage", "motherboard", "vrm", "board"],
  network: ["network", "internet", "wifi", "download", "upload", "speed"],
  processes: ["programs", "processes", "apps", "running", "task", "tasks"],
};
const ALERT_WORDS = ["alert", "alerts", "problem", "problems", "warning", "warnings", "issue", "issues", "fix", "wrong"];

const wordsOf = (text) => String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function searchResults(query, devices) {
  const q = wordsOf(query);
  if (!q.length) return [];
  const hits = (words) => q.every((w) => words.some((t) => t.startsWith(w)));
  const out = [];
  devices.forEach((d) => {
    if (hits(wordsOf(d.device_name))) out.push({ key: `pc-${d.id}`, kind: "PC", label: d.device_name, go: { nav: "devices" } });
  });
  if (hits(ALERT_WORDS)) out.push({ key: "alerts", kind: "Alerts", label: "Open alerts", go: { nav: "alerts" } });
  GROUPS.forEach((g) => {
    const words = [...GROUP_WORDS[g.id] || [], ...wordsOf(g.label), ...g.readings.flatMap((r) => wordsOf(r.label))];
    if (hits(words)) out.push({ key: `g-${g.id}`, kind: "Readings", label: `${g.label} readings`, go: { tab: g.id } });
  });
  ALL_PAGES.forEach((p) => {
    if (hits([...(PAGE_WORDS[p.id] || []), ...wordsOf(p.label)])) out.push({ key: `p-${p.id}`, kind: "Page", label: p.label, go: { nav: p.id } });
  });
  return out.slice(0, 7);
}

/** Page title on the left; search and the alerts bell on the right. */
export function PageHeader({ title, intro, alertsCount = 0, onNavigate, onBell, onDashboardTab }) {
  const [query, setQuery] = useState("");
  const [devices, setDevices] = useState(null);
  const [focused, setFocused] = useState(false);
  const listId = useId();

  // PC names are fetched the first time someone uses the search.
  const loadDevices = () => {
    if (devices) return;
    setDevices([]);
    fetchDevices().then((res) => setDevices(res?.devices || [])).catch(() => {});
  };

  const results = searchResults(query, devices || []);
  const open = focused && query.trim().length > 0;

  const pick = (r) => {
    setQuery("");
    setFocused(false);
    if (r.go.tab) onDashboardTab?.(r.go.tab);
    else onNavigate?.(r.go.nav);
  };

  return (
    <header className="top">
      <div className="title-wrap">
        <h1 className="title">{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </div>
      <div className="tools">
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (results[0]) pick(results[0]);
          }}
          onFocus={() => { setFocused(true); loadDevices(); }}
          onBlur={(e) => { if (!e.currentTarget.parentElement.contains(e.relatedTarget)) setFocused(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setFocused(false); } }}
        >
          <Search strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your PCs, alerts, readings…"
            aria-label="Search your PCs, alerts, readings and pages"
            aria-controls={open ? listId : undefined}
          />
        </form>
        {open && (
          <div
            id={listId}
            className="search-results"
            onBlur={(e) => { if (!e.currentTarget.parentElement.contains(e.relatedTarget)) setFocused(false); }}
          >
            <p className="sr-only" role="status">{results.length ? `${results.length} results` : "No results"}</p>
            {results.length ? (
              <ul>
                {results.map((r) => (
                  <li key={r.key}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>
                      <span>{r.label}</span>
                      <small>{r.kind}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="search-none">Nothing matches “{query.trim()}”. Try a PC's name, “temperature” or “alerts”.</p>
            )}
          </div>
        )}
        <button
          type="button"
          className="bell"
          onClick={() => (onBell ? onBell() : onNavigate?.("alerts"))}
          aria-haspopup="dialog"
          aria-label={alertsCount ? `Alerts (${alertsCount})` : "Alerts"}
          title="Alerts"
        >
          <Bell strokeWidth={1.9} />
          {alertsCount > 0 && <i aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

// --------------------------------------------------------- small pieces

export function Card({ as: Tag = "article", className, children, ...rest }) {
  return <Tag className={cx("card", className)} {...rest}>{children}</Tag>;
}

/** Card heading: a green icon, the title, and anything on the right. */
export function Head({ icon: Icon, title, children, id }) {
  return (
    <div className="hd">
      {Icon && <Icon strokeWidth={1.9} aria-hidden="true" />}
      <h2 id={id}>{title}</h2>
      {children && <span className="r">{children}</span>}
    </div>
  );
}

export function Chip({ tone, children }) {
  return <span className={cx("chip", tone)}>{children}</span>;
}

export function Ico({ icon: Icon, tone }) {
  return <span className={cx("ico", tone)} aria-hidden="true"><Icon strokeWidth={1.9} /></span>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="fld">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Slider({ label, display, lo, hi, ...input }) {
  return (
    <label className="sl">
      <span>{label}<b>{display}</b></span>
      <input type="range" {...input} />
      <em><span>{lo}</span><span>{hi}</span></em>
    </label>
  );
}

/** Pill buttons where one is open at a time: the black one. */
export function Tabs({ items, value, onChange, label }) {
  return (
    <div className="ctabs" role="group" aria-label={label}>
      {items.map(({ id, label: text, icon: Icon, count, mark }) => (
        <button key={id} type="button" className={id === value ? "on" : undefined} aria-pressed={id === value} onClick={() => onChange(id)}>
          {Icon && <Icon strokeWidth={1.9} aria-hidden="true" />}
          {text}
          {count !== undefined && <b>{count}</b>}
          {mark}
        </button>
      ))}
    </div>
  );
}

/** Small segmented switch, used for graph periods. */
export function Seg({ items, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" className={it.id === value ? "on" : undefined} aria-pressed={it.id === value} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Card with a label, a large value, a line under it and an icon for what it
 * measures. `tone` fills the card: "gd" brand green, "dk" black, "gs" soft green.
 */
export function Stat({ label, value, unit, sub, icon, warn, tone, action = "View details", onAction }) {
  return (
    <article className={cx("card stat", tone, warn && "w")}>
      <div>
        <h3>{label}</h3>
        <div className="val">{value}{unit && <small> {unit}</small>}</div>
        {sub && <div className="delta">{sub}</div>}
      </div>
      <div className="stat-side">
        {icon ? <Ico icon={icon} tone={warn ? "w" : "k"} /> : <span />}
        {onAction && (
          <button type="button" className="vd" onClick={onAction} aria-label={`${action}: ${label}`}>{action}</button>
        )}
      </div>
    </article>
  );
}

const RING_TONES = {
  dark: ["rgba(255,255,255,0.16)", "#5cc061"],
  soft: ["#b5dfbe", "#1c7a2e"],
  white: ["#ebebed", "#1c7a2e"],
};

/** Progress ring with a short label or icon in the middle. `share` is 0 to 1. */
export function Ring({ share = 1, tone = "white", warn, children }) {
  const [track, stroke] = RING_TONES[tone] || RING_TONES.white;
  const length = 2 * Math.PI * 13;
  const filled = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
  return (
    <div className="rng" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13" fill="none" stroke={track} strokeWidth="3.4" />
        {filled > 0 && (
          <circle
            cx="16" cy="16" r="13" fill="none" stroke={warn ? "#ec003f" : stroke} strokeWidth="3.4" strokeLinecap="round"
            strokeDasharray={`${length * filled} ${length}`} transform="rotate(-90 16 16)"
          />
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** Fully rounded card: a ring, a title with a line under it, then an action. */
export function Pill({ tone = "white", ring, title, sub, children }) {
  return (
    <article className={cx("pill", tone)}>
      {ring}
      <span>
        <b className="cut">{title}</b>
        <small className="cut">{sub}</small>
      </span>
      {children}
    </article>
  );
}

/**
 * Half-donut gauge. `share` is 0 to 1. Where the coloured part meets the black
 * track, the coloured part ends in a rounded edge rather than a straight cut.
 */
export function Gauge({ share, warn }) {
  const clipId = useId();
  const length = Math.PI * 34;
  const filled = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
  const colour = warn ? "#ec003f" : "#5cc061";
  // The rounded edge is a circle as wide as the arc, centred on the arc's end.
  // Everything is clipped at the baseline, so near 0% it can't poke out below.
  const angle = Math.PI * (1 - filled);
  const endX = 42 + 34 * Math.cos(angle);
  const endY = 42 - 34 * Math.sin(angle);
  return (
    <svg className="gauge" viewBox="0 0 84 44" aria-hidden="true">
      <defs>
        <clipPath id={clipId}><rect x="0" y="0" width="84" height="42" /></clipPath>
      </defs>
      <path d="M8 42a34 34 0 0 1 68 0" fill="none" stroke="#0e0e10" strokeWidth="13" />
      {filled > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <path d="M8 42a34 34 0 0 1 68 0" fill="none" stroke={colour} strokeWidth="13" strokeDasharray={`${length * filled} ${length}`} />
          {filled < 1 && <circle cx={endX} cy={endY} r="6.5" fill={colour} />}
        </g>
      )}
    </svg>
  );
}

// ------------------------------------------------------------- line graph

const W = 1000; // the plot is drawn in a 1000 by 300 box and stretched to fit
const H = 300;

/** Which points get an x-axis label: about six, always including the newest. */
function labelledPoints(count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil((count - 1) / 6);
  const picks = [];
  for (let i = count - 1; i >= 0; i -= step) picks.unshift(i);
  return picks;
}

/**
 * Line graph on a white card. `series` is [{ name, colour, values, tagText }],
 * every `values` array as long as `labels`; missing readings are null. A single
 * series gets a soft fill. With `endTags`, each line ends in a dot and a label
 * filled in its colour showing its latest value (`tagBg` and `tagText` override the
 * label colours). Hover or the arrow keys read out single points.
 */
export function LineGraph({ series, labels = [], min = 0, max = 100, unit = "", digits = 0, limit, bare, endTags, emptyText = "No readings yet", summary }) {
  const [focus, setFocus] = useState(null);
  const fillId = useId();
  const count = labels.length;
  const show = (v) => fmt(v, digits, unit);
  const span = max - min || 1;
  const x = (i) => (count > 1 ? (i / (count - 1)) * W : W / 2);
  const share = (v) => Math.min(1, Math.max(0, (v - min) / span));
  const y = (v) => H - share(v) * H;
  const hasData = count > 0 && series.some((s) => s.values.some((v) => v !== null && v !== undefined));

  const pick = (clientX, box) => {
    if (!count) return;
    const at = (clientX - box.left) / box.width;
    setFocus(Math.min(count - 1, Math.max(0, Math.round(at * (count - 1)))));
  };
  const onKey = (e) => {
    if (!count || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const from = focus ?? count - 1;
    setFocus(Math.min(count - 1, Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const steps = [1, 0.75, 0.5, 0.25, 0];
  const tickText = (s) => show(min + s * span);
  const widest = steps.map(tickText).reduce((a, b) => (b.length > a.length ? b : a), "");
  const left = focus === null || count < 2 ? 50 : (focus / (count - 1)) * 100;
  const focused = focus === null ? [] : series.filter((s) => s.values[focus] !== null && s.values[focus] !== undefined);

  // End labels: each series' latest value, nudged apart so labels never overlap.
  const tags = !endTags || !hasData ? [] : series
    .map((s) => {
      const i = s.values.findLastIndex((v) => v !== null && v !== undefined);
      return i < 0 ? null : { s, value: s.values[i], at: (i / Math.max(1, count - 1)) * 100, top: (1 - share(s.values[i])) * 100 };
    })
    .filter(Boolean)
    .sort((a, b) => a.top - b.top);
  // A series with a single reading has no line to draw (for example a PC's
  // first hour on an hourly graph), so it is shown as a dot instead.
  const lone = !hasData ? [] : series
    .map((s) => {
      const idx = s.values.flatMap((v, i) => (v === null || v === undefined ? [] : [i]));
      return idx.length === 1 ? { s, at: (count > 1 ? idx[0] / (count - 1) : 0.5) * 100, top: (1 - share(s.values[idx[0]])) * 100 } : null;
    })
    .filter((d) => d && !tags.some((t) => t.s.name === d.s.name));

  const GAP = 13; // the least room between two labels, in percent of the plot's height
  tags.forEach((t, i) => { t.labelTop = i ? Math.max(t.top, tags[i - 1].labelTop + GAP) : t.top; });
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const room = i === tags.length - 1 ? 100 : tags[i + 1].labelTop - GAP;
    if (tags[i].labelTop > room) tags[i].labelTop = room;
  }

  return (
    <div className={cx("plot", bare && "bare", tags.length > 0 && "has-tags")}>
      <div className="plot-y" aria-hidden="true">
        <span>{widest}</span>
        {steps.map((s) => <span key={s} className="at" style={{ top: `${(1 - s) * 100}%` }}>{tickText(s)}</span>)}
      </div>

      <div
        className="plot-area"
        tabIndex={0}
        role="img"
        aria-label={`${summary || "Line graph"}${hasData ? ". Use the arrow keys to read single points." : `. ${emptyText}.`}`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setFocus(null)}
        onKeyDown={onKey}
        onBlur={() => setFocus(null)}
      >
        {!bare && steps.map((s) => <i key={s} className="gl" style={{ top: `${(1 - s) * 100}%` }} aria-hidden="true" />)}
        {hasData ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#5cc061" stopOpacity="0.34" />
                <stop offset="1" stopColor="#5cc061" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {series.map((s, k) => {
              const pts = s.values
                .map((v, i) => (v === null || v === undefined ? null : [x(i), y(v)]))
                .filter(Boolean);
              if (!pts.length) return null;
              const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
              return (
                <g key={s.name}>
                  {k === 0 && series.length === 1 && pts.length > 1 && (
                    <path d={`M${pts[0][0].toFixed(1)},${H} L${line.split(" ").join(" L")} L${pts[pts.length - 1][0].toFixed(1)},${H} Z`} fill={`url(#${fillId})`} />
                  )}
                  <polyline points={line} fill="none" stroke={s.colour} strokeWidth={series.length > 1 ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
        ) : (
          <span className="empty" style={{ position: "absolute", inset: 0, padding: 0 }}>{emptyText}</span>
        )}
        {limit !== undefined && limit !== null && hasData && (
          <i className="lim" style={{ top: `${(1 - share(limit)) * 100}%` }} aria-hidden="true">
            <span>Limit {Number.isInteger(limit) ? fmt(limit, 0, unit) : show(limit)}</span>
          </i>
        )}
        {lone.map((d) => (
          <i key={d.s.name} className="pt" style={{ left: `${d.at}%`, top: `${d.top}%`, borderColor: d.s.colour }} aria-hidden="true" />
        ))}
        {tags.map((t) => (
          <React.Fragment key={t.s.name}>
            <i className="pt" style={{ left: `${t.at}%`, top: `${t.top}%`, borderColor: t.s.colour }} aria-hidden="true" />
            <span className="endtag" style={{ top: `${t.labelTop}%`, background: t.s.tagBg || t.s.colour, color: t.s.tagText || "#fff" }} aria-hidden="true">
              {t.s.name} {show(t.value)}
            </span>
          </React.Fragment>
        ))}
        {focused.length > 0 && (
          <>
            <i className="guide" style={{ left: `${left}%` }} aria-hidden="true" />
            {focused.map((s) => (
              <i key={s.name} className="pt" style={{ left: `${left}%`, top: `${(1 - share(s.values[focus])) * 100}%`, borderColor: s.colour }} aria-hidden="true" />
            ))}
            <span
              className={cx("tip", left > 78 && "is-left", left < 22 && "is-right")}
              style={{ left: `${left}%`, top: `${(1 - share(focused[0].values[focus])) * 100}%` }}
              role="status"
            >
              {focused.map((s) => <b key={s.name}>{focused.length > 1 ? `${s.name} ` : ""}{show(s.values[focus])}</b>)}
              {labels[focus]}
            </span>
          </>
        )}
      </div>

      <div className="plot-x" aria-hidden="true">
        {labelledPoints(count).map((i) => (
          <span
            key={i}
            className={count > 1 && i === 0 ? "is-first" : count > 1 && i === count - 1 ? "is-last" : undefined}
            style={{ left: `${count > 1 ? (i / (count - 1)) * 100 : 50}%` }}
          >
            {labels[i]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- dialog

/** Centred dialog. Escape, the close button or a click outside closes it. */
export function Modal({ title, onClose, children }) {
  const titleId = useId();
  const closeRef = useRef(null);
  // Kept in a ref so a new onClose function on every render does not re-run the effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="hd">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-x" ref={closeRef} onClick={onClose} aria-label="Close">
            <X strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- promo card

export function PromoArt() {
  return (
    <svg className="promo-art" viewBox="0 0 135 110" aria-hidden="true">
      <path d="M136 112C104 96 84 70 80 34c22 18 44 40 56 78Z" fill="#1c7a2e" />
      <path d="M136 112C120 82 116 50 126 16c14 28 16 62 10 96Z" fill="#5cc061" />
      <path d="M136 112C98 106 72 92 54 64c30 2 60 18 82 48Z" fill="#3a9542" />
      <path d="M136 112C110 112 84 108 62 92c26-6 52 2 74 20Z" fill="#b5dfbe" />
      <circle cx="112" cy="66" r="9" fill="#fff" fillOpacity="0.22" />
      <circle cx="112" cy="66" r="4.5" fill="#fff" />
    </svg>
  );
}

/** Green card that opens the AI diagnosis, where Lectio explains an alert. */
export function Promo({ onOpen, note }) {
  return (
    <button type="button" className="promo" onClick={onOpen}>
      <PromoArt />
      <span className="promo-brand">
        <svg viewBox="0 0 32.5 45" style={{ height: "calc(8 * var(--u))", width: "auto" }} aria-hidden="true">
          <path fill="#fff" d="M0 0H13V32.5H32.5V45H0Z" />
          <path fill="#5cc061" d="M19 0H32.5V25.4L25.75 20.4L19 25.4Z" />
        </svg>
        Lectio AI
      </span>
      <svg className="promo-go" viewBox="0 0 15 15" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12 12 3M5 3h7v7" />
      </svg>
      <span className="promo-title">Let Lectio diagnose<br />your PC</span>
      <span className="tag a" aria-hidden="true">AI Diagnosis</span>
      <span className="tag b" aria-hidden="true">Fixes</span>
      {note && <span className="promo-foot">{note}</span>}
    </button>
  );
}
