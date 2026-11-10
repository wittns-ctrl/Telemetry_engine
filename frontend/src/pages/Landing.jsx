import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Cpu, LifeBuoy,
  MoreHorizontal, Radio, Search, ShieldCheck, Thermometer, Zap, Layers,
} from 'lucide-react';
import './landing.css';

/* ------------------------------------------------------------------ */
/* Phone mock-ups used in the hero cards (illustrative sample data)    */
/* ------------------------------------------------------------------ */
const PHONE_TILES = [
  { label: 'Temperature', icon: Thermometer, tone: 'amber' },
  { label: 'CPU Load', icon: Cpu, tone: 'cyan' },
  { label: 'Network', icon: Radio, tone: 'ink' },
  { label: 'Alerts', icon: AlertTriangle, tone: 'rose' },
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
  { label: 'Temperature', pct: 44, tone: '#f59e0b' },
  { label: 'CPU', pct: 33, tone: '#06b6d4' },
  { label: 'Network', pct: 23, tone: '#232327' },
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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wide = window.matchMedia('(min-width: 901px)');

    // 1. Entrance animations: elements fade up once, the first time they are seen.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      }),
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    );
    $$('[data-reveal]').forEach((el) => io.observe(el));

    // 2. Highlight the nav link for the section currently on screen.
    const links = $$('[data-nav]');
    const spy = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === en.target.id));
      }),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    $$('[data-section]').forEach((el) => spy.observe(el));

    // 3. Scroll-linked motion: the tablet lies flat as it rises, and the steps
    //    slide sideways while their section is pinned.
    let tabTo = 0; let tabAt = 0;
    let railTo = 0; let railAt = 0;
    let raf = 0; let last = 0; let dirty = true;

    function readScroll() {
      const vh = window.innerHeight;
      chrome.classList.toggle('is-scrolled', window.scrollY > 12);
      const zr = tabletZone.getBoundingClientRect();
      tabTo = clamp((vh - zr.top) / (vh * 0.85), 0, 1);
      const rr = rail.getBoundingClientRect();
      const max = rr.height - vh;
      railTo = max > 0 ? clamp(-rr.top / max, 0, 1) : 0;
    }

    function paint() {
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
      const moving = Math.abs(tg) > 0.0002 || Math.abs(rg) > 0.0002;
      if (moving) { tabAt += tg * k; railAt += rg * k; }
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
    paint();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      spy.disconnect();
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', onResize);
      document.documentElement.classList.remove('lp-smooth');
    };
  }, [rootRef]);
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
  },
  {
    icon: AlertTriangle,
    title: 'Alerts the moment a limit breaks',
    body: 'Every reading is checked against your thresholds as it arrives. Breaches show up in the live stream right away.',
    visual: 'alerts',
  },
  {
    icon: ShieldCheck,
    title: 'Private to your account',
    body: 'Each account only sees its own devices and readings. Sign in with email or Google.',
    visual: 'lock',
  },
];

const STEPS = [
  { title: 'Create your account', body: 'Sign up with email or Google and verify your address.' },
  { title: 'Connect a machine', body: 'Run the agent, sign in once, and the machine registers itself.' },
  { title: 'Watch it live', body: 'Readings stream to your dashboard over a live connection.' },
  { title: 'Diagnose issues', body: 'AI diagnostics explain what a breach most likely means.' },
];

const PILLS = [
  { k: '°C', label: 'Temperature', tone: 'amber' },
  { k: '%', label: 'CPU load', tone: 'cyan' },
  { k: 'MB/s', label: 'Network', tone: 'lime' },
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

function StackVisual({ kind }) {
  if (kind === 'code') {
    return (
      <pre className="lp-code">{`{
  "sensor_id": "sensor_edge_node_4",
  "metric_type": "temperature",
  "value": 71.4,
  "unit": "C"
}`}</pre>
    );
  }
  if (kind === 'alerts') {
    return (
      <div className="lp-alerts">
        {[['sensor_edge_node_4', 'temperature · 108.2'], ['sensor_db_cluster_a', 'cpu · 96.4'], ['sensor_gateway_01', 'network · 1,420']].map(([s, m]) => (
          <div key={s} className="lp-alert-row">
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
      <div className="lp-lock-ring"><ShieldCheck size={34} strokeWidth={1.6} /></div>
      <span>Your devices</span><span>Your readings</span><span>Your alerts</span>
    </div>
  );
}

function Badge({ children }) {
  return <p className="lp-badge"><span className="lp-badge-ic"><Activity size={13} strokeWidth={2.6} /></span>{children}</p>;
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
      <header className="lp-chrome" data-chrome>
        <a className="lp-brand" href="#home">Telemetry Engine</a>
        <nav className="lp-nav" aria-label="Primary">
          <a href="#home" data-nav="home" className="is-active">Home</a>
          <a href="#features" data-nav="features">Features</a>
          <a href="#steps" data-nav="steps">How it works</a>
          <a href="#faq" data-nav="faq">FAQ</a>
        </nav>
        <div className="lp-chrome-end">
          <a className="lp-round" href="#faq" aria-label="Find answers in the FAQ"><Search size={17} /></a>
          <Link className="lp-btn lp-btn-dark lp-btn-sm" to="/signin">Log in</Link>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero" id="home" data-section>
        <div className="lp-hero-copy">
          <Badge>Real-time device monitoring, simplified</Badge>
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
          <Badge>Features</Badge>
          <h2>Telemetry That Fits The Way You Already Work</h2>
        </div>
        <div className="lp-stack">
          {STACK.map((c, i) => (
            <article key={c.title} className="lp-stack-card" style={{ '--i': i }}>
              <div className="lp-stack-copy">
                <span className="lp-chip"><c.icon size={18} /></span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
              <div className="lp-stack-visual"><StackVisual kind={c.visual} /></div>
            </article>
          ))}
        </div>
      </section>

      {/* STEPS — the section pins and the cards slide sideways as you scroll. */}
      <section className="lp-rail" id="steps" data-rail data-section>
        <div className="lp-rail-pin">
          <div className="lp-rail-head" data-reveal>
            <Badge>How it works</Badge>
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
        <div className="lp-band-inner" data-reveal>
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
          <Badge>Frequently Asked Questions</Badge>
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
