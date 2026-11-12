import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, CircleHelp, Cpu,
  HardDrive, House, LayoutGrid, MemoryStick, MonitorSmartphone, MoreHorizontal, Radio, Stethoscope,
  Thermometer, Workflow, Zap,
} from 'lucide-react';
import { SITE } from '../siteInfo';
import { LectioMark } from '../components/LectioMark';
import './landing.css';

/* ------------------------------------------------------------------ */
/* Phone mock-ups used in the hero cards (illustrative sample data)    */
/* ------------------------------------------------------------------ */
const PHONE_TILES = [
  { label: 'Temperature', icon: Thermometer, tone: 'lime' },
  { label: 'CPU load', icon: Cpu, tone: 'ink' },
  { label: 'GPU', icon: MonitorSmartphone, tone: 'white' },
  { label: 'Alerts', icon: AlertTriangle, tone: 'soft' },
];

function PhoneTiles() {
  return (
    <div className="ph ph-tilt" aria-hidden="true">
      <div className="ph-screen">
        <div className="ph-title">Your PCs</div>
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
        <div className="pv-brand"><span className="pv-logo"><LectioMark size="1em" /></span>Lectio</div>
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
    const cascade = $('[data-cascade]');
    const cards = $$('[data-cascade-card]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // With reduced motion the feature cards are simply listed one after another.
    cascade.classList.toggle('is-static', reduce);

    // 1. Entrance animations play once, the first time an element is seen.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }),
      // Start a little before an element scrolls in, so it is already visible
      // when it arrives (and the cards peeking in under the hero show on load).
      { threshold: 0, rootMargin: '0px 0px 8% 0px' },
    );
    $$('[data-reveal]').forEach((el) => io.observe(el));

    // 2. Scroll-linked motion: the tablet lies flat as it rises, and the
    //    feature cards cascade onto a pile while their section is pinned.
    let tabTo = 0; let tabAt = 0;
    let casTo = 0; let casAt = 0; let casIn = false;
    let raf = 0; let last = 0; let dirty = true;
    const drops = cards.length - 1; // the first card is already on the table
    const HOLD = 0.15; // a little scroll at the end where the full pile just sits

    function readScroll() {
      const vh = window.innerHeight;
      chrome.classList.toggle('is-scrolled', window.scrollY > 12);
      const zr = tabletZone.getBoundingClientRect();
      tabTo = clamp((vh - zr.top) / (vh * 0.85), 0, 1);
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
        // land() reaches the pile at t≈0.42 and bottoms out its bounce at t≈0.6,
        // so the content starts there rather than leaving a blank card on screen.
        const landed = i === 0 ? casIn : t[i] > 0.6;
        card.classList.toggle('is-landed', landed);
        card.classList.toggle('is-top', landed && depth < 0.5);
      });
    }

    function paint() {
      paintCascade();
      const s = ease(tabAt);
      tablet.style.transform = `translate3d(0,${((1 - s) * 50).toFixed(1)}px,0) rotateX(${((1 - s) * 38).toFixed(2)}deg) scale(${(0.88 + 0.12 * s).toFixed(4)})`;
      glow.style.opacity = s;
    }

    function frame(now) {
      // Time-based easing, so it feels the same on any refresh rate.
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      const k = reduce ? 1 : 1 - Math.exp(-dt * CHASE);
      const tg = tabTo - tabAt;
      const cg = casTo - casAt;
      const moving = Math.abs(tg) > 0.0002 || Math.abs(cg) > 0.0005;
      if (moving) { tabAt += tg * k; casAt += cg * k; }
      if (moving || dirty) { paint(); dirty = false; }
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => { dirty = true; readScroll(); };
    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.documentElement.classList.add('lp-smooth');
    readScroll();
    tabAt = tabTo;
    casAt = casTo;
    paint();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
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
  { id: 'features', label: 'Features', icon: LayoutGrid },
  { id: 'steps', label: 'How it works', short: 'Steps', icon: Workflow },
  { id: 'faq', label: 'FAQ', icon: CircleHelp },
];

function LiquidNav() {
  const [active, setActive] = useState('home');
  const trackRef = useRef(null);
  const lensRef = useRef(null);
  const itemRefs = useRef({});
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

  // Put the glass lens over the active item (it slides there via a CSS transition).
  const place = useCallback(() => {
    const el = itemRefs.current[active];
    const lens = lensRef.current;
    if (!el || !lens) return;
    lens.style.setProperty('--x', `${el.offsetLeft + el.offsetWidth / 2}px`);
    lens.style.setProperty('--w', `${el.offsetWidth}px`);
  }, [active]);

  useLayoutEffect(() => { place(); }, [place]);

  // Re-measure when the layout changes (fonts, breakpoints).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const ro = new ResizeObserver(() => place());
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
      <a className="lp-brand" href="#home" onClick={() => go('home')} aria-label="Lectio home">
        <span className="lp-brand-mark"><LectioMark size={20} /></span>
        <span className="lp-brand-name">Lectio</span>
      </a>

      <span className="lp-dock-sep" aria-hidden="true" />

      <nav className="lp-dock" aria-label="Primary" ref={trackRef}>
        <span className="lp-lens" ref={lensRef} aria-hidden="true"><span className="lp-lens-body" /></span>
        {NAV_ITEMS.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            ref={(el) => { itemRefs.current[it.id] = el; }}
            className={`lp-dock-item ${active === it.id ? 'is-active' : ''}`}
            aria-current={active === it.id ? 'true' : undefined}
            onClick={() => go(it.id)}
          >
            <it.icon className="lp-dock-ic" size={21} />
            <span className="lp-dock-label">
              <span className="lp-dock-long">{it.label}</span>
              <span className="lp-dock-short">{it.short || it.label}</span>
            </span>
          </a>
        ))}
      </nav>

      <span className="lp-dock-sep" aria-hidden="true" />

      <div className="lp-chrome-end">
        <Link className="lp-login" to="/signin">Log in</Link>
        <Link className="lp-signup" to="/signup">Sign up<span className="lp-signup-long">&nbsp;free</span></Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
// Feature cards. Everything claimed here is something the app shows today
// (see DevicesView, DiagnosisPanel and the anomaly engine's limits in app/core/config.py).
const STACK = [
  {
    tag: 'Sensors',
    title: 'See every part of your PC',
    body: 'CPU and GPU temperature and load, memory, power-supply voltage, and drive space and health, live in one place.',
    visual: 'sensors',
  },
  {
    tag: 'Alerts',
    title: 'Warned before it becomes a problem',
    body: 'Every reading is checked against a safe limit as it arrives. If one is crossed, the alert shows up in Lectio straight away.',
    visual: 'alerts',
  },
  {
    tag: 'Diagnosis',
    title: 'Told what to do about it',
    body: 'Open an alert and get a diagnosis in plain words: the likely cause, how urgent it is, and the steps to fix it. It is written by AI, so treat it as a suggestion.',
    visual: 'diagnosis',
  },
  {
    tag: 'Privacy',
    title: 'Private to your account',
    body: 'Only you can see your PCs and readings. Sign in with email or Google, and delete everything whenever you like.',
    visual: 'lock',
  },
];

const STEPS = [
  { title: 'Create your free account', body: 'Sign up with email or Google. No credit card.' },
  { title: 'Install the agent', body: 'Run the Lectio agent on your Windows 10 or 11 PC and sign in once. Your PC adds itself.' },
  { title: 'Watch it live', body: 'Temperatures, load and memory stream to your dashboard as they happen.' },
  { title: 'Get warned', body: 'If a reading crosses a safe limit, an alert shows up in Lectio right away.' },
  { title: 'Find out why', body: 'Open the alert under My Devices and press Diagnose for the likely cause and step-by-step fixes.' },
];

// The vital signs on the dark band.
const PILLS = [
  { k: '°C', label: 'CPU & GPU temperature' },
  { k: '%', label: 'CPU & GPU load' },
  { k: 'GB', label: 'Memory in use' },
  { k: 'V', label: 'Power supply' },
  { k: 'SSD', label: 'Drive space & health' },
];

const FAQ = [
  {
    group: 'The basics',
    items: [
      { q: 'Is Lectio really free?', a: 'Yes. Lectio is free to use, with no credit card and no limit on how many PCs you connect.' },
      { q: 'Which computers does it work on?', a: 'Windows 10 and Windows 11 desktops and laptops. Lectio reads the sensors your PC already has, so you don\'t need any extra hardware.' },
      { q: 'What does Lectio measure?', a: 'CPU and GPU temperature and load, memory use, power-supply voltage, and drive space and health. Each reading is saved with the time it was taken.' },
    ],
  },
  {
    group: 'Setting up',
    items: [
      { q: 'How do I connect my PC?', a: 'Run the Lectio agent on the PC and sign in once. It adds that PC to your account and starts sending readings, which show up under My Devices.' },
      { q: 'How many PCs can I connect?', a: 'As many as you like. Each one gets its own page under My Devices.' },
    ],
  },
  {
    group: 'Alerts and your data',
    items: [
      { q: 'How do alerts work?', a: 'Every reading is checked against a safe limit, such as 90°C for a CPU. When a reading crosses it, an alert appears in your live stream and on your dashboard straight away.' },
      { q: 'What is an AI diagnosis?', a: 'Open an alert under My Devices and press Diagnose. Lectio looks at the alert and your PC\'s readings from the few minutes around it, then explains the likely cause, how urgent it is, and what to do, step by step. It is written by AI (OpenAI) and can be wrong, so check it before acting. If the AI is unavailable, you get Lectio\'s standard steps for that kind of alert instead, labelled as such.' },
      { q: 'Who can see my data?', a: 'Only you. Each account sees its own PCs, readings and alerts, and nothing from anyone else. We never sell your data.' },
      { q: 'How long is my data kept?', a: 'Until you remove the PC or delete your account. Deleting either one permanently erases its readings and alerts.' },
    ],
  },
];

// Sample readings for the "every part of your PC" card.
const SENSOR_ROWS = [
  { icon: Thermometer, name: 'CPU', value: '64°C · 38%' },
  { icon: MonitorSmartphone, name: 'GPU', value: '71°C · 52%' },
  { icon: MemoryStick, name: 'Memory', value: '9.4 of 16 GB' },
  { icon: Zap, name: 'Power supply', value: '12.04 V' },
  { icon: HardDrive, name: 'Drive C:', value: '96% health' },
];

// Sample report for the diagnosis card: the cause, then numbered steps.
const DIAGNOSIS_ROWS = [
  ['Likely cause', 'Dust in the CPU cooler', 'Act now'],
  ['Clean the cooler and fans', 'Hardware', '~20 min'],
  ['Check the cooler is seated', 'Hardware', '~30 min'],
  ['Close heavy background apps', 'Software', '~10 min'],
];

// Sample alerts, using the app's real default limits. `fill` and `limit` place the
// reading and the limit on each row's bar (as % of a sensible range for that sensor).
const ALERT_ROWS = [
  { icon: Thermometer, name: 'CPU temperature', device: 'Gaming PC', value: '96°C', limitText: 'limit 90°C', fill: 87, limit: 82 },
  { icon: Zap, name: 'Power supply 12V', device: 'Office PC', value: '11.2 V', limitText: 'min 11.4 V', fill: 48, limit: 56 },
  { icon: HardDrive, name: 'Drive health', device: 'Gaming PC', value: '8%', limitText: 'min 10%', fill: 8, limit: 10 },
];

function StackVisual({ kind }) {
  if (kind === 'sensors') {
    return (
      <div className="lp-alerts">
        {SENSOR_ROWS.map((r, n) => (
          <div key={r.name} className="lp-alert-row lp-sensor-row" style={{ '--n': n }}>
            <span><r.icon size={14} /></span>
            <div><b>{r.name}</b></div>
            <em>{r.value}</em>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'diagnosis') {
    return (
      <div className="lp-alerts">
        {DIAGNOSIS_ROWS.map(([title, sub, tag], n) => (
          <div key={title} className="lp-alert-row lp-sensor-row" style={{ '--n': n }}>
            <span>{n === 0 ? <Stethoscope size={14} /> : n}</span>
            <div><b>{title}</b><i>{sub}</i></div>
            <em>{tag}</em>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'alerts') {
    return (
      <div className="lp-alerts">
        {ALERT_ROWS.map((r, n) => (
          <div key={r.name} className="lp-alert-row lp-reading-row is-critical" style={{ '--n': n }}>
            <span><r.icon size={15} /></span>
            <div><b>{r.name}</b><i>{r.device}</i></div>
            <strong>{r.value}<small>{r.limitText}</small></strong>
            <div className="lp-reading-bar" style={{ '--fill': `${r.fill}%`, '--limit': `${r.limit}%` }} aria-hidden="true" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="lp-lock">
      <div className="lp-lock-ring">
        <div className="lp-lock-who"><span>You</span><b>Only you can see</b></div>
      </div>
      {['Your devices', 'Your readings', 'Your alerts'].map((t, n) => (
        <span key={t} className="lp-lock-tag" style={{ '--n': n }}>{t}</span>
      ))}
    </div>
  );
}

// Footer wordmark. A light sweeps across it on a loop (CSS); while a mouse is over
// it, the light follows the pointer instead.
function Wordmark() {
  const wrapRef = useRef(null);
  const textRef = useRef(null);

  const follow = (e) => {
    if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = textRef.current.getBoundingClientRect();
    wrapRef.current.classList.add('is-tracking');
    textRef.current.style.setProperty('--lx', `${(((e.clientX - box.left) / box.width) * 100).toFixed(1)}%`);
  };
  const release = () => {
    wrapRef.current.classList.remove('is-tracking');
    textRef.current.style.removeProperty('--lx');
  };

  return (
    <div className="lp-wordmark" data-reveal aria-hidden="true" ref={wrapRef} onPointerMove={follow} onPointerLeave={release}>
      <span ref={textRef}>lectio</span>
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
    document.title = 'Lectio — free PC health monitoring for Windows';
    return () => { document.title = prev; };
  }, []);

  let faqN = 0;

  return (
    <div className="lp" ref={rootRef}>
      <LiquidNav />

      <main id="main">
      {/* HERO */}
      <section className="lp-hero" id="home" data-section>
        <div className="lp-hero-copy">
          <p className="lp-eyebrow"><span className="lp-eyebrow-dot" aria-hidden="true" />Lectio · free PC health monitor for Windows</p>
          <h1>Know the moment your PC <span className="lp-mark">runs too hot</span></h1>
          <p className="lp-lead">Lectio keeps an eye on your computer&apos;s temperatures, CPU and GPU load, memory and drives, and warns you as soon as something crosses a safe limit.</p>
          <div className="lp-actions">
            <Link className="lp-btn lp-btn-dark" to="/signup">Create free account <ArrowRight size={16} /></Link>
            <a className="lp-btn lp-btn-soft" href="#steps">See how it works</a>
          </div>
          <ul className="lp-facts" aria-label="At a glance">
            <li>Free to use</li>
            <li>Windows 10 &amp; 11</li>
            <li>No credit card</li>
          </ul>
          <p className="lp-have-account">Already have an account? <Link to="/signin">Log in</Link></p>
        </div>

        <div className="lp-bento">
          <article className="lp-tile lp-tile-tall">
            <div className="lp-tile-art"><PhoneTiles /></div>
            <div className="lp-tile-text">
              <h3>All your PCs in one place</h3>
              <p>Check temperature, load and memory for every PC you own, each one against safe limits.</p>
            </div>
          </article>

          <article className="lp-tile lp-tile-wide" style={{ '--d': '90ms' }}>
            <div className="lp-tile-body">
              <h3>Your PC, decoded</h3>
              <p>From CPU load to GPU temperature, follow every reading that matters to your PC&apos;s health.</p>
              <a className="lp-btn lp-btn-line" href="#preview">See the dashboard</a>
            </div>
            <PhoneLive />
          </article>

          <article className="lp-tile lp-tile-stats" style={{ '--d': '180ms' }}>
            <div>
              <h3>Price</h3>
              <div className="lp-stat"><b>Free</b><span>No credit card, and no limit on how many PCs you connect</span></div>
            </div>
            <div>
              <h3>Always up to date</h3>
              <div className="lp-stat"><b>Live</b><span>Readings and alerts reach your dashboard as they happen</span></div>
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
        <div className="lp-preview-copy">
          <h2>One dashboard for every PC you own</h2>
          <p>Totals, safe limits, recent alerts and a live health gauge, all on one clean screen.</p>
          <Link className="lp-btn lp-btn-dark" to="/signup">Create free account <ArrowRight size={16} /></Link>
        </div>
      </section>

      {/* FEATURES — cards stack over each other while you scroll. */}
      <section className="lp-features" id="features" data-section>
        <div className="lp-head">
          <h2>Everything you need to keep your PC healthy</h2>
        </div>
        <div className="lp-cascade" data-cascade>
          <div className="lp-cascade-pin">
          {STACK.map((c, i) => (
            <article key={c.title} className="lp-stack-card" data-cascade-card style={{ '--i': i }}>
              <div className="lp-stack-copy">
                <span className={`lp-chip${c.visual === 'alerts' ? ' is-critical' : ''}`}>{c.tag}</span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
              <div className="lp-stack-visual"><StackVisual kind={c.visual} /></div>
            </article>
          ))}
          </div>
        </div>
      </section>

      {/* STEPS — a plain row of four cards. */}
      <section className="lp-rail" id="steps" data-section>
        <div className="lp-rail-pin">
          <div className="lp-rail-head">
            <h2>Up and running in five steps</h2>
            <p>No extra hardware and nothing to wire up. Just your Windows PC and a free account.</p>
            <Link className="lp-btn lp-btn-dark" to="/signup">Create free account <ArrowRight size={16} /></Link>
          </div>
          <div className="lp-rail-window">
            <ol className="lp-rail-track">
              {STEPS.map((s, i) => (
                <li key={s.title} className="lp-step">
                  <div className="lp-step-top">
                    <span className="lp-step-n">{String(i + 1).padStart(2, '0')}</span>
                  </div>
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
        <div className="lp-band-inner" data-reveal>
          <p className="lp-kicker">What we watch</p>
          <h2>Five vital signs, checked on every reading</h2>
          <p>Each one has a safe limit. Cross it and Lectio flags it straight away.</p>
          <div className="lp-pills">
            {PILLS.map((p, i) => (
              <div key={p.label} className="lp-capsule" style={{ '--n': i }}>
                <b>{p.k}</b><span>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-faq" id="faq" data-section>
        <div className="lp-head">
          <h2>Questions, answered</h2>
          <p>Everything you might want to know before you sign up.</p>
        </div>
        <div className="lp-faq-grid">
          <aside className="lp-help">
            <ol className="lp-help-art">
              {['Monitor a computer', 'Send a metric by hand', 'Watch readings live', 'Manage your account'].map((t) => <li key={t}>{t}</li>)}
            </ol>
            <div className="lp-help-text">
              <h3>Built-in help</h3>
              <span>Step-by-step guides inside the app</span>
            </div>
            <p>Every account includes a Help page that walks you through connecting your PC, reading your dashboard and understanding alerts.</p>
          </aside>
          <div className="lp-faq-list">
            {FAQ.map((g) => (
              <div key={g.group} className="lp-faq-group">
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
        <div>
          <h2>Peace of mind for <span className="lp-mark" data-reveal>every PC</span> you own</h2>
          <Link className="lp-btn lp-btn-dark" to="/signup">Create free account <ArrowRight size={16} /></Link>
          <p className="lp-close-note">Free · Windows 10 &amp; 11 · No credit card</p>
        </div>
      </section>
      </main>

      <footer className="lp-footer">
        {/* Soft shapes drifting behind the glass, so it has something to blur. */}
        <div className="lp-footer-orbs" aria-hidden="true"><i /><i /><i /></div>
        <div className="lp-footer-glass">
          <div className="lp-footer-row">
            <span>Free PC health monitoring for Windows</span>
            <nav aria-label="Footer">
              <a href="#features">Features</a>
              <a href="#steps">How it works</a>
              <a href="#faq">FAQ</a>
              <Link to="/signup">Sign up</Link>
              <Link to="/signin">Log in</Link>
              {SITE.contactEmail
                ? <a href={`mailto:${SITE.contactEmail}`}>Contact</a>
                : <Link to="/privacy">Contact</Link>}
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
            </nav>
          </div>
          <Wordmark />
        </div>
      </footer>
    </div>
  );
}
