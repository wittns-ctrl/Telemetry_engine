import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, CircleHelp, Cpu, House,
  LifeBuoy, LogIn, MoreHorizontal, Radio, ShieldCheck, Sparkles, Thermometer, Workflow, Zap, Layers,
} from 'lucide-react';
import './landing.css';

/* ------------------------------------------------------------------ */
/* Phone mock-ups used in the hero cards (illustrative sample data)    */
/* ------------------------------------------------------------------ */
const PHONE_TILES = [
  { label: 'Temperature', icon: Thermometer, tone: 'lime' },
  { label: 'CPU Load', icon: Cpu, tone: 'ink' },
  { label: 'Network', icon: Radio, tone: 'white' },
  { label: 'Alerts', icon: AlertTriangle, tone: 'soft' },
];

function PhoneTiles() {
  return (
    <div className="ph ph-tilt" aria-hidden="true">
      <div className="ph-screen">
        <div className="ph-title">Your Devices</div>
        <div className="ph-grid">
          {PHONE_TILES.map((t) => (
            <div key={t.label} className="ph-tile">
              <span className={`ph-ic ph-${t.tone}`}><t.icon size="1em" /></span>
              <b>{t.label}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhoneLive() {
  return (
    <div className="ph-crop" aria-hidden="true">
      <div className="ph">
        <div className="ph-screen">
          <div className="ph-island" />
          <div className="ph-bar">
            <span><ArrowLeft size="1em" /></span>
            <b>Live Stream</b>
            <span><MoreHorizontal size="1em" /></span>
          </div>
          <div className="ph-chart">
            <svg viewBox="0 0 200 110" preserveAspectRatio="none">
              <path className="ph-area" d="M0 90 C8 84 17 72 25 72 S42 80 50 80 S67 56 75 56 S92 64 100 64 S117 40 125 40 S142 48 150 48 S167 22 175 22 L200 22 V110 H0 Z" />
              <path className="ph-line" pathLength="1" d="M0 90 C8 84 17 72 25 72 S42 80 50 80 S67 56 75 56 S92 64 100 64 S117 40 125 40 S142 48 150 48 S167 22 175 22" />
            </svg>
            <span className="ph-dot" />
            <div className="ph-chip"><i>CPU load</i><b>42%</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Static dashboard preview shown inside the tablet (sample data)      */
/* ------------------------------------------------------------------ */
const PREVIEW_BARS = [
  { label: 'Temperature', pct: 44, tone: '#c2ea2e' },
  { label: 'CPU', pct: 33, tone: '#1c1c1f' },
  { label: 'Network', pct: 23, tone: '#a1a1aa' },
];
const PREVIEW_SENSORS = ['sensor_server_101', 'sensor_edge_node_4', 'sensor_db_cluster_a', 'sensor_gateway_01'];
const PREVIEW_NAV = ['Dashboard', 'My Devices', 'Metrics Studio', 'Live Stream', 'Analytics', 'Sensors'];

function DashboardPreview() {
  return (
    <div className="pv" aria-hidden="true">
      <aside className="pv-side">
        <div className="pv-brand"><span className="pv-logo"><Layers size="1em" /></span>Telemetry</div>
        {PREVIEW_NAV.map((n, i) => (
          <div key={n} className={`pv-nav ${i === 0 ? 'is-on' : ''}`}>{n}</div>
        ))}
        <div className="pv-status">
          <b>System status</b>
          <span>All systems operational</span>
        </div>
      </aside>
      <div className="pv-main">
        <div className="pv-top">
          <div>
            <div className="pv-h">Telemetry Dashboard</div>
            <div className="pv-sub">Sample data · live view of every reporting device</div>
          </div>
          <div className="pv-actions">
            <span className="pv-btn pv-btn-dark">+ Ingest Metric</span>
            <span className="pv-btn">Simulate Stream</span>
          </div>
        </div>

        <div className="pv-kpis">
          <div className="pv-card pv-card-dark">
            <span>Total Metrics Ingested</span>
            <b>12,480</b>
            <i><ArrowUpRight size="1em" /> Stored readings</i>
          </div>
          <div className="pv-card"><span><Thermometer size="1em" /> Temperature</span><b>5,512</b><i>Limit: 100°C</i></div>
          <div className="pv-card"><span><Cpu size="1em" /> CPU Load</span><b>4,096</b><i>Limit: 90%</i></div>
          <div className="pv-card"><span><Radio size="1em" /> Network</span><b>2,872</b><i>Limit: 1000 MB/s</i></div>
        </div>

        <div className="pv-row">
          <div className="pv-card pv-grow">
            <div className="pv-title">Readings by Type</div>
            {PREVIEW_BARS.map((b) => (
              <div key={b.label} className="pv-bar">
                <div><span>{b.label}</span><span>{b.pct}%</span></div>
                <u><s style={{ width: `${b.pct}%`, background: b.tone }} /></u>
              </div>
            ))}
          </div>
          <div className="pv-card pv-gauge">
            <div className="pv-title">Live Safety Gauge</div>
            <svg viewBox="0 0 100 57">
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e4e4e7" strokeWidth="13" strokeLinecap="round" />
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1c1c1f" strokeWidth="13" strokeLinecap="round" strokeDasharray="116 126" />
            </svg>
            <b>92%</b>
            <span>Within limits</span>
          </div>
          <div className="pv-card pv-sensors">
            <div className="pv-title">Recently Active Sensors</div>
            {PREVIEW_SENSORS.map((s) => (
              <div key={s} className="pv-sensor"><em />{s}</div>
            ))}
          </div>
        </div>

        <div className="pv-card pv-alert">
          <span className="pv-alert-ic"><AlertTriangle size="1em" /></span>
          <div>
            <b>sensor_edge_node_4</b>
            <span>temperature · value 108.2 · limit 100</span>
          </div>
          <strong>CRITICAL</strong>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */
const CHASE = 12; // how tightly scroll-linked motion follows the scroll position (per second)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - (1 - t) ** 3; // ease-out cubic
// Ease-out with a small overshoot, so a falling card lands and settles.
const land = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
// Where each card comes to rest on the pile, and which way it swings in from.
const CASCADE_REST = [
  { r: -2.4, x: -6 },
  { r: 1.8, x: 8, from: 1 },
  { r: -0.8, x: -2, from: -1 },
];

function useLandingMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => Array.from(root.querySelectorAll(sel));
    const chrome = $('[data-chrome]');
    const tabletZone = $('[data-tablet-zone]');
    const tablet = $('[data-tablet]');
    const glow = $('[data-glow]');
    const rail = $('[data-rail]');
    const railTrack = $('[data-rail-track]');
    const cascade = $('[data-cascade]');
    const cards = $$('[data-cascade-card]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wide = window.matchMedia('(min-width: 901px)');
    // With reduced motion the feature cards are simply listed one after another.
    cascade.classList.toggle('is-static', reduce);

    // 1. Entrance animations: elements fade up the first time they are seen.
    //    Ones marked data-replay play again every time they come back on screen.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        if (!('replay' in en.target.dataset)) io.unobserve(en.target);
      }),
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    );
    $$('[data-reveal]').forEach((el) => io.observe(el));
    // Reset replaying elements only once they are fully off screen, so the reset is never seen.
    const away = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (!en.isIntersecting) en.target.classList.remove('is-in'); }),
      { threshold: 0 },
    );
    $$('[data-reveal][data-replay]').forEach((el) => away.observe(el));

    // 2. Scroll-linked motion: the tablet lies flat as it rises, the feature
    //    cards cascade onto a pile, and the steps slide sideways while their
    //    section is pinned.
    let tabTo = 0; let tabAt = 0;
    let railTo = 0; let railAt = 0;
    let casTo = 0; let casAt = 0; let casIn = false;
    let raf = 0; let last = 0; let dirty = true;
    const drops = cards.length - 1; // the first card is already on the table
    const HOLD = 0.3; // a little scroll at the end where the full pile just sits

    function readScroll() {
      const vh = window.innerHeight;
      chrome.classList.toggle('is-scrolled', window.scrollY > 12);
      const zr = tabletZone.getBoundingClientRect();
      tabTo = clamp((vh - zr.top) / (vh * 0.85), 0, 1);
      const rr = rail.getBoundingClientRect();
      const max = rr.height - vh;
      railTo = max > 0 ? clamp(-rr.top / max, 0, 1) : 0;
      const cr = cascade.getBoundingClientRect();
      const cmax = cr.height - vh;
      casTo = cmax > 0 ? clamp(-cr.top / cmax, 0, 1) * (drops + HOLD) : drops;
      // The first card is already on the table; it plays once its stage is mostly in view.
      const wasIn = casIn;
      casIn = cr.top < vh * 0.35 && cr.bottom > vh * 0.5;
      if (wasIn !== casIn) dirty = true;
    }

    function paintCascade() {
      if (reduce) {
        cards.forEach((c) => {
          c.style.transform = ''; c.style.opacity = ''; c.style.removeProperty('--dim');
          c.classList.add('is-landed');
        });
        return;
      }
      const vh = window.innerHeight;
      // How far each card has fallen: 0 = waiting above the screen, 1 = on the pile.
      const t = cards.map((_, i) => (i === 0 ? 1 : clamp(casAt - (i - 1), 0, 1)));
      cards.forEach((card, i) => {
        const rest = CASCADE_REST[i % CASCADE_REST.length];
        const fall = 1 - land(t[i]);
        const side = rest.from || 0;
        // Cards that have landed on top push this one back into the pile.
        let depth = 0;
        for (let j = i + 1; j < cards.length; j += 1) depth += ease(t[j]);
        const y = fall * -(vh * 0.95) - depth * 16;
        const x = rest.x + fall * side * 90;
        const r = rest.r + fall * side * 13;
        const s = 1 - depth * 0.045;
        card.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(4)})`;
        card.style.opacity = i === 0 ? '' : clamp(t[i] * 5, 0, 1).toFixed(3);
        card.style.setProperty('--dim', Math.min(depth, 2).toFixed(3));
        // A card plays its content animation once it has landed and is on top.
        const landed = i === 0 ? casIn : t[i] > 0.9;
        card.classList.toggle('is-landed', landed);
        card.classList.toggle('is-top', landed && depth < 0.5);
      });
    }

    function paint() {
      paintCascade();
      const s = ease(tabAt);
      tablet.style.transform = `translate3d(0,${((1 - s) * 50).toFixed(1)}px,0) rotateX(${((1 - s) * 38).toFixed(2)}deg) scale(${(0.88 + 0.12 * s).toFixed(4)})`;
      glow.style.opacity = s;
      if (wide.matches) {
        const travel = Math.max(0, railTrack.scrollWidth - railTrack.parentElement.clientWidth);
        railTrack.style.transform = `translate3d(${(-railAt * travel).toFixed(1)}px,0,0)`;
      } else {
        railTrack.style.transform = '';
      }
    }

    function frame(now) {
      // Time-based easing, so it feels the same on any refresh rate.
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      const k = reduce ? 1 : 1 - Math.exp(-dt * CHASE);
      const tg = tabTo - tabAt;
      const rg = railTo - railAt;
      const cg = casTo - casAt;
      const moving = Math.abs(tg) > 0.0002 || Math.abs(rg) > 0.0002 || Math.abs(cg) > 0.0005;
      if (moving) { tabAt += tg * k; railAt += rg * k; casAt += cg * k; }
      if (moving || dirty) { paint(); dirty = false; }
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => { dirty = true; readScroll(); };
    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.documentElement.classList.add('lp-smooth');
    readScroll();
    tabAt = tabTo;
    railAt = railTo;
    casAt = casTo;
    paint();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      away.disconnect();
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', onResize);
      document.documentElement.classList.remove('lp-smooth');
    };
  }, [rootRef]);
}

/* ------------------------------------------------------------------ */
/* Floating nav with a glass lens that slides to the active section    */
/* ------------------------------------------------------------------ */
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'features', label: 'Features', icon: Sparkles },
  { id: 'steps', label: 'How it works', short: 'Steps', icon: Workflow },
  { id: 'faq', label: 'FAQ', icon: CircleHelp },
];

function LiquidNav() {
  const [active, setActive] = useState('home');
  const trackRef = useRef(null);
  const lensRef = useRef(null);
  const bodyRef = useRef(null);
  const itemRefs = useRef({});
  const lastX = useRef(null);
  const lockUntil = useRef(0);

  // Follow the section on screen as the page scrolls.
  useEffect(() => {
    const spy = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting && performance.now() > lockUntil.current) setActive(en.target.id);
      }),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    document.querySelectorAll('.lp [data-section]').forEach((el) => spy.observe(el));
    const unlock = () => { lockUntil.current = 0; };
    window.addEventListener('scrollend', unlock);
    return () => { spy.disconnect(); window.removeEventListener('scrollend', unlock); };
  }, []);

  // Put the lens over the active item; stretch it like liquid while it travels.
  const place = useCallback((wobble) => {
    const el = itemRefs.current[active];
    const lens = lensRef.current;
    if (!el || !lens) return;
    const x = el.offsetLeft + el.offsetWidth / 2;
    lens.style.setProperty('--x', `${x}px`);
    lens.style.setProperty('--w', `${el.offsetWidth}px`);
    const dist = lastX.current == null ? 0 : Math.abs(x - lastX.current);
    lastX.current = x;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (wobble && dist > 4 && !reduce && bodyRef.current?.animate) {
      const s = Math.min(0.28, 0.08 + dist / 900);
      bodyRef.current.animate(
        [
          { transform: 'scale(1, 1)' },
          { transform: `scale(${1 + s}, ${1 - s * 0.45})`, offset: 0.3 },
          { transform: `scale(${1 - s * 0.18}, ${1 + s * 0.12})`, offset: 0.68 },
          { transform: 'scale(1, 1)' },
        ],
        { duration: 680, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
      );
    }
  }, [active]);

  useLayoutEffect(() => { place(true); }, [place]);

  // Re-measure when the layout changes (fonts, breakpoints), without the wobble.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(track);
    const id = requestAnimationFrame(() => lensRef.current?.classList.add('is-ready'));
    return () => { ro.disconnect(); cancelAnimationFrame(id); };
  }, [place]);

  const go = (id) => {
    lockUntil.current = performance.now() + 1400;
    setActive(id);
  };

  return (
    <header className="lp-chrome" data-chrome>
      <a className="lp-brand" href="#home" onClick={() => go('home')} aria-label="Telemetry Engine home">
        <span className="lp-brand-mark"><Activity size={18} strokeWidth={2.6} /></span>
        <span className="lp-brand-name">Telemetry Engine</span>
      </a>

      <span className="lp-dock-sep" aria-hidden="true" />

      <nav className="lp-dock" aria-label="Primary" ref={trackRef}>
        <span className="lp-lens" ref={lensRef} aria-hidden="true"><span className="lp-lens-body" ref={bodyRef} /></span>
        {NAV_ITEMS.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            ref={(el) => { itemRefs.current[it.id] = el; }}
            className={`lp-dock-item ${active === it.id ? 'is-active' : ''}`}
            aria-current={active === it.id ? 'true' : undefined}
            onClick={() => go(it.id)}
          >
            <it.icon className="lp-dock-ic" size={21} strokeWidth={2.1} />
            <span className="lp-dock-label">
              <span className="lp-dock-long">{it.label}</span>
              <span className="lp-dock-short">{it.short || it.label}</span>
            </span>
          </a>
        ))}
      </nav>

      <span className="lp-dock-sep" aria-hidden="true" />

      <div className="lp-chrome-end">
        <Link className="lp-login" to="/signin" aria-label="Log in">
          <span className="lp-login-text">Log in</span>
          <LogIn className="lp-login-ic" size={17} />
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
const STACK = [
  {
    icon: Zap,
    title: 'Ingest from anywhere',
    body: 'Install the agent on a machine or post readings straight to the API. Temperature, CPU and network metrics land in one place.',
    visual: 'code',
    tone: 'paper',
  },
  {
    icon: AlertTriangle,
    title: 'Alerts the moment a limit breaks',
    body: 'Every reading is checked against your thresholds as it arrives. Breaches show up in the live stream right away.',
    visual: 'alerts',
    tone: 'ink',
  },
  {
    icon: ShieldCheck,
    title: 'Private to your account',
    body: 'Each account only sees its own devices and readings. Sign in with email or Google.',
    visual: 'lock',
    tone: 'lime',
  },
];

const STEPS = [
  { title: 'Create your account', body: 'Sign up with email or Google and verify your address.' },
  { title: 'Connect a machine', body: 'Run the agent, sign in once, and the machine registers itself.' },
  { title: 'Watch it live', body: 'Readings stream to your dashboard over a live connection.' },
  { title: 'Diagnose issues', body: 'AI diagnostics explain what a breach most likely means.' },
];

const PILLS = [
  { k: '°C', label: 'Temperature', tone: 'lime' },
  { k: '%', label: 'CPU load', tone: 'light' },
  { k: 'MB/s', label: 'Network', tone: 'graphite' },
];

const FAQ = [
  {
    group: 'Getting started',
    items: [
      { q: 'How do I connect a device?', a: 'Run the telemetry agent on the machine and sign in once. It registers that machine to your account and starts sending readings, which then show up under My Devices.' },
      { q: 'Do I need special hardware?', a: 'No. The agent is software that runs on the machines you already have. You can also post readings straight to the API, or use the built-in simulator to try things out.' },
    ],
  },
  {
    group: 'Data and alerts',
    items: [
      { q: 'What does Telemetry Engine measure?', a: 'Temperature, CPU load and network throughput. Each reading is stored with its sensor and the time it arrived.' },
      { q: 'How do alerts work?', a: 'Every metric type has a limit. When a reading goes over it, an alert is raised and appears in your live stream and on the dashboard straight away.' },
      { q: 'Who can see my data?', a: 'Only you. Each account sees its own devices, readings and alerts, and nothing from anyone else.' },
    ],
  },
];

// A reading as it is posted to the API, one line per entry so it can type in.
const CODE_LINES = [
  [['p', '{']],
  [['k', '  "sensor_id"'], ['p', ': '], ['s', '"sensor_edge_node_4"'], ['p', ',']],
  [['k', '  "metric_type"'], ['p', ': '], ['s', '"temperature"'], ['p', ',']],
  [['k', '  "value"'], ['p', ': '], ['n', '71.4'], ['p', ',']],
  [['k', '  "unit"'], ['p', ': '], ['s', '"C"']],
  [['p', '}']],
];

function StackVisual({ kind }) {
  if (kind === 'code') {
    return (
      <div className="lp-code">
        <div className="lp-code-bar" aria-hidden="true"><i /><i /><i /><span>POST /api/metrics</span></div>
        <pre>
          {CODE_LINES.map((line, n) => (
            <span key={n} className="lp-code-line" style={{ '--n': n }}>
              {line.map(([tone, text], j) => <span key={j} className={`lp-tok-${tone}`}>{text}</span>)}
              {n === CODE_LINES.length - 1 && <span className="lp-caret" aria-hidden="true" />}
            </span>
          ))}
        </pre>
        <span className="lp-code-ok" aria-hidden="true">201 Stored</span>
      </div>
    );
  }
  if (kind === 'alerts') {
    return (
      <div className="lp-alerts">
        {[['sensor_edge_node_4', 'temperature · 108.2'], ['sensor_db_cluster_a', 'cpu · 96.4'], ['sensor_gateway_01', 'network · 1,420']].map(([s, m], n) => (
          <div key={s} className="lp-alert-row" style={{ '--n': n }}>
            <span><AlertTriangle size={14} /></span>
            <div><b>{s}</b><i>{m}</i></div>
            <em>CRITICAL</em>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="lp-lock">
      <div className="lp-lock-ring">
        <i className="lp-ripple" aria-hidden="true" />
        <i className="lp-ripple" aria-hidden="true" style={{ '--n': 1 }} />
        <ShieldCheck size={34} strokeWidth={1.6} />
      </div>
      {['Your devices', 'Your readings', 'Your alerts'].map((t, n) => (
        <span key={t} className="lp-lock-tag" style={{ '--n': n }}>{t}</span>
      ))}
    </div>
  );
}

function FaqItem({ n, q, a, open, onToggle }) {
  const id = `faq-${n}`;
  return (
    <div className={`lp-faq-item ${open ? 'is-open' : ''}`}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="lp-faq-n">{String(n).padStart(2, '0')}</span>
        <span className="lp-faq-q">{q}</span>
        <ChevronDown size={18} className="lp-faq-chev" />
      </button>
      <div className="lp-faq-a" id={id} role="region">
        <div><p>{a}</p></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Landing() {
  const rootRef = useRef(null);
  const [openFaq, setOpenFaq] = useState(1);
  useLandingMotion(rootRef);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Telemetry Engine — real-time device monitoring';
    return () => { document.title = prev; };
  }, []);

  let faqN = 0;

  return (
    <div className="lp" ref={rootRef}>
      <LiquidNav />

      {/* HERO */}
      <section className="lp-hero" id="home" data-section>
        <div className="lp-hero-copy">
          <h1>Your Trusted Gateway To <span className="lp-mark">Live Device Telemetry</span></h1>
          <p className="lp-lead">Track temperature, CPU and network readings from every machine you run, get alerted the moment a limit breaks, and keep it all in one simple, clear place.</p>
          <div className="lp-actions">
            <Link className="lp-btn lp-btn-dark" to="/signin">Start Now</Link>
            <a className="lp-btn lp-btn-soft" href="#features">Learn More</a>
          </div>
        </div>

        <div className="lp-bento">
          <article className="lp-tile lp-tile-tall" data-reveal>
            <div className="lp-tile-art"><PhoneTiles /></div>
            <div className="lp-tile-text">
              <h3>Precision Monitoring</h3>
              <p>Watch temperature, CPU load and network throughput for each device, checked against your limits.</p>
            </div>
          </article>

          <article className="lp-tile lp-tile-wide" data-reveal style={{ '--d': '90ms' }}>
            <div className="lp-tile-body">
              <h3>Your Fleet, Decoded</h3>
              <p>From live CPU load to temperature trends, follow every reading that matters to the health of your machines.</p>
              <Link className="lp-btn lp-btn-line" to="/signin">Open Dashboard</Link>
            </div>
            <PhoneLive />
          </article>

          <article className="lp-tile lp-tile-stats" data-reveal style={{ '--d': '180ms' }}>
            <div>
              <h3>Metric Types</h3>
              <div className="lp-stat"><b>3</b><span>Temperature, CPU load and network, ready out of the box</span></div>
            </div>
            <div>
              <h3>Always Streaming</h3>
              <div className="lp-stat"><b>Live</b><span>Readings and alerts reach your dashboard as they arrive</span></div>
            </div>
          </article>
        </div>
      </section>

      {/* TABLET — tips forward and lies flat as it scrolls into view. */}
      <section className="lp-preview" id="preview">
        <div className="lp-tablet-zone" data-tablet-zone>
          <div className="lp-glow" data-glow />
          <div className="lp-tablet" data-tablet>
            <div className="lp-tablet-screen"><DashboardPreview /></div>
          </div>
        </div>
        <div className="lp-preview-copy" data-reveal>
          <h2>One dashboard for every device you run</h2>
          <p>Totals, limits, recent alerts and a live safety gauge, on a clean white canvas that stays readable all day.</p>
          <Link className="lp-btn lp-btn-dark" to="/signin">Get started</Link>
        </div>
      </section>

      {/* FEATURES — cards stack over each other while you scroll. */}
      <section className="lp-features" id="features" data-section>
        <div className="lp-head" data-reveal>
          <h2>Telemetry That Fits The Way You Already Work</h2>
        </div>
        <div className="lp-cascade" data-cascade>
          <div className="lp-cascade-pin">
          {STACK.map((c, i) => (
            <article key={c.title} className={`lp-stack-card lp-stack-${c.tone}`} data-cascade-card style={{ '--i': i }}>
              <div className="lp-stack-copy">
                <span className="lp-chip"><c.icon size={18} /></span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
              <div className="lp-stack-visual"><StackVisual kind={c.visual} /></div>
            </article>
          ))}
          </div>
        </div>
      </section>

      {/* STEPS — the section pins and the cards slide sideways as you scroll. */}
      <section className="lp-rail" id="steps" data-rail data-section>
        <div className="lp-rail-pin">
          <div className="lp-rail-head" data-reveal>
            <h2>From Sign-Up To First Alert In Four Steps</h2>
            <p>No hardware to buy and nothing to wire up. Scroll to walk through it.</p>
          </div>
          <div className="lp-rail-window">
            <ol className="lp-rail-track" data-rail-track>
              {STEPS.map((s, i) => (
                <li key={s.title} className="lp-step">
                  <span className="lp-step-n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* WHAT WE WATCH — pills drop into place when the band appears. */}
      <section className="lp-band">
        <div className="lp-band-inner" data-reveal data-replay>
          <p className="lp-kicker">What we watch</p>
          <h2>Three signals, checked on every reading</h2>
          <p>Each one has its own limit. Cross it and you hear about it straight away.</p>
          <div className="lp-pills">
            {PILLS.map((p, i) => (
              <div key={p.label} className={`lp-capsule lp-capsule-${p.tone}`} style={{ '--n': i }}>
                <b>{p.k}</b><span>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-faq" id="faq" data-section>
        <div className="lp-head" data-reveal>
          <h2>Get Quick Answers To Common Questions</h2>
          <p>Find solutions, explore the product, and get set up faster</p>
        </div>
        <div className="lp-faq-grid">
          <aside className="lp-help" data-reveal>
            <div className="lp-help-art"><LifeBuoy size={64} strokeWidth={1.3} /></div>
            <div className="lp-help-text">
              <h3>Built-in Help</h3>
              <span>Step-by-step guides inside the app</span>
            </div>
            <p>Every account includes a Help page that walks you through connecting devices, sending readings and reading alerts.</p>
            <Link className="lp-btn lp-btn-dark" to="/signin">Sign in to get started <ArrowRight size={16} /></Link>
          </aside>
          <div className="lp-faq-list">
            {FAQ.map((g) => (
              <div key={g.group} className="lp-faq-group" data-reveal>
                <h3>{g.group}</h3>
                {g.items.map((it) => {
                  faqN += 1;
                  const n = faqN;
                  return (
                    <FaqItem key={it.q} n={n} q={it.q} a={it.a} open={openFaq === n} onToggle={() => setOpenFaq(openFaq === n ? 0 : n)} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="lp-close">
        <div data-reveal>
          <h2>Clear, reliable monitoring for <span className="lp-mark" data-reveal>every machine</span> you run</h2>
          <Link className="lp-btn lp-btn-dark" to="/signin">Get started <ArrowRight size={16} /></Link>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-row">
          <span>Real-time telemetry, alerts and diagnostics</span>
          <nav aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#steps">How it works</a>
            <a href="#faq">FAQ</a>
            <Link to="/signin">Log in</Link>
          </nav>
        </div>
        <div className="lp-wordmark" data-reveal aria-hidden="true"><span>Telemetry Engine</span></div>
      </footer>
    </div>
  );
}
