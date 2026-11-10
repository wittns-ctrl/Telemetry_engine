import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, AlertTriangle, Cpu, Radio, Thermometer, ShieldCheck, Zap, Layers } from 'lucide-react';
import './landing.css';

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
/* Scroll choreography                                                 */
/* ------------------------------------------------------------------ */

// Each hero panel owns a slice of the hero scroll as
// [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in 0..1 progress.
// The gaps between one panel's fadeOutEnd and the next panel's fadeInStart are
// short pauses, so two panels are never readable at once.
const CUES = [
  [0.0, 0.0, 0.2, 0.3],
  [0.34, 0.44, 0.6, 0.7],
  [0.74, 0.84, 1.1, 1.2],
];
const DRIFT = 22; // px of counter-scroll travel per panel
const CHASE = 24; // how tightly the animation follows the scroll position; high = no perceptible lag

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// smootherstep: zero velocity and acceleration at both ends
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const ramp = (p, a, b) => (b <= a ? (p >= b ? 1 : 0) : smooth(clamp((p - a) / (b - a), 0, 1)));

function useScrollChoreography(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => Array.from(root.querySelectorAll(sel));
    const track = $('[data-track]');
    const panels = $$('[data-panel]');
    const hint = $('[data-hint]');
    const tabletZone = $('[data-tablet-zone]');
    const tablet = $('[data-tablet]');
    const glow = $('[data-glow]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let heroTo = 0;
    let heroAt = 0;
    let tabTo = 0;
    let tabAt = 0;
    let raf = 0;
    let last = 0;
    let dirty = true;

    function measure() {
      dirty = true;
      readScroll();
    }

    function readScroll() {
      const vh = window.innerHeight;
      const tr = track.getBoundingClientRect();
      const max = tr.height - vh;
      heroTo = max > 0 ? clamp(-tr.top / max, 0, 1) : 0;

      // 0 when the tablet's top edge enters the viewport, 1 once it has risen most of the way up.
      const zr = tabletZone.getBoundingClientRect();
      tabTo = clamp((vh - zr.top) / (vh * 0.8), 0, 1);
    }

    function paint() {
      panels.forEach((el, i) => {
        const c = CUES[i];
        const enter = ramp(heroAt, c[0], c[1]);
        const leave = ramp(heroAt, c[2], c[3]);
        const o = enter * (1 - leave);
        const y = (1 - enter) * DRIFT - leave * DRIFT;
        el.style.opacity = o;
        el.style.transform = `translate3d(0,${y}px,0)`;
        el.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
      });

      hint.style.opacity = 1 - ramp(heroAt, 0, 0.05);

      // Tablet: tipped back on entry, lies flat as it reaches the middle of the screen.
      const s = smooth(tabAt);
      tablet.style.transform = `translate3d(0,${((1 - s) * 60).toFixed(1)}px,0) rotateX(${((1 - s) * 42).toFixed(2)}deg) scale(${(0.86 + 0.14 * s).toFixed(4)})`;
      glow.style.opacity = s;
    }

    function frame(now) {
      // Chase the scroll position instead of snapping to it. The step is based on
      // elapsed time, so it feels the same at 60 Hz, 120 Hz or after a dropped frame.
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      const k = reduce ? 1 : 1 - Math.exp(-dt * CHASE);
      const hg = heroTo - heroAt;
      const tg = tabTo - tabAt;
      const moving = Math.abs(hg) > 0.0002 || Math.abs(tg) > 0.0002;
      if (moving) {
        heroAt += hg * k;
        tabAt += tg * k;
      }
      // Nothing to redraw while the page is at rest.
      if (moving || dirty) {
        paint();
        dirty = false;
      }
      raf = requestAnimationFrame(frame);
    }

    // Simple one-shot reveals for the sections below the hero.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      }),
      { threshold: 0.18 },
    );
    $$('[data-reveal]').forEach((el) => io.observe(el));

    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('resize', measure);
    document.documentElement.classList.add('lp-smooth');
    measure();
    heroAt = heroTo;
    tabAt = tabTo;
    paint();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', measure);
      document.documentElement.classList.remove('lp-smooth');
    };
  }, [rootRef]);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
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
  { title: 'Register a device', body: 'Add a device and copy its key into the agent.' },
  { title: 'Watch it live', body: 'Readings stream to your dashboard over a live connection.' },
  { title: 'Diagnose issues', body: 'AI diagnostics explain what a breach most likely means.' },
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

export default function Landing() {
  const rootRef = useRef(null);
  useScrollChoreography(rootRef);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Telemetry Engine — real-time device monitoring';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      <header className="lp-chrome">
        <a className="lp-logo" href="#top" aria-label="Telemetry Engine home"><Layers size={20} strokeWidth={2.2} /></a>
        <nav className="lp-nav" aria-label="Primary">
          <a href="#preview">Product</a>
          <a href="#benefits">Benefits</a>
          <a href="#steps">How it works</a>
          <Link to="/signin">Sign in</Link>
          <Link className="lp-pill lp-pill-sm" to="/signin">Get started</Link>
        </nav>
      </header>

      {/* HERO — a tall track with a sticky stage; scrolling cross-fades the headlines. */}
      <section className="lp-track" data-track id="top">
        <div className="lp-stage">
          <div className="lp-backdrop" />
          <div className="lp-grain" />

          <div className="lp-panels">
            <section className="lp-panel" data-panel>
              <p className="lp-eyebrow">Telemetry Engine <span>&middot;</span> Real-time device monitoring</p>
              <h1>Every signal.<br />In real time.</h1>
              <p className="lp-sub">Temperature, CPU and network readings from every device you run, streamed live and checked against your limits.</p>
              <div className="lp-cta"><Link className="lp-pill" to="/signin">Start monitoring <ArrowRight size={16} /></Link></div>
            </section>

            <section className="lp-panel" data-panel>
              <p className="lp-eyebrow">Live from every machine</p>
              <h2 className="lp-h1">See it as<br />it happens.</h2>
              <p className="lp-sub">A lightweight agent reports from each machine. You get the reading, the trend and the breach, not just a red light.</p>
              <div className="lp-cta"><a className="lp-pill" href="#preview">See the dashboard</a></div>
            </section>

            <section className="lp-panel" data-panel>
              <p className="lp-eyebrow">Alerts and diagnostics</p>
              <h2 className="lp-h1">Know before<br />it overheats.</h2>
              <p className="lp-sub">Thresholds raise an alert the moment a reading crosses the line, and AI diagnostics explain what likely went wrong.</p>
              <div className="lp-cta"><Link className="lp-pill" to="/signin">Create your account</Link></div>
            </section>
          </div>

          <div className="lp-foot" data-hint>Scroll to explore</div>
        </div>
      </section>

      {/* TABLET — tips forward and flattens as it scrolls into view. */}
      <section className="lp-preview" id="preview">
        <div className="lp-tablet-zone" data-tablet-zone>
          <div className="lp-glow" data-glow />
          <div className="lp-tablet" data-tablet>
            <div className="lp-tablet-screen"><DashboardPreview /></div>
          </div>
        </div>
        <div className="lp-preview-copy" data-reveal>
          <h2>One dashboard for every device you run.</h2>
          <p>Totals, limits, recent alerts and a live safety gauge, on a clean white canvas that stays readable all day.</p>
          <Link className="lp-pill" to="/signin">Get started</Link>
        </div>
      </section>

      {/* BENEFITS — cards stack over each other while you scroll. */}
      <section className="lp-benefits" id="benefits">
        <div className="lp-head" data-reveal>
          <p className="lp-kicker">Benefits</p>
          <h2>Telemetry that fits the way you already work.</h2>
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

      {/* STEPS */}
      <section className="lp-steps" id="steps">
        <div className="lp-head" data-reveal>
          <p className="lp-kicker">How it works</p>
          <h2>From sign-up to first alert in four steps.</h2>
        </div>
        <ol className="lp-step-grid">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lp-step" data-reveal style={{ '--d': `${i * 90}ms` }}>
              <span className="lp-step-n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* CLOSING CTA */}
      <section className="lp-close">
        <div className="lp-close-card" data-reveal>
          <p className="lp-kicker">Ready when you are</p>
          <h2>Start monitoring today.</h2>
          <p>Connect your first device and watch the readings arrive.</p>
          <Link className="lp-pill lp-pill-light" to="/signin">Create your account <ArrowRight size={16} /></Link>
        </div>
        <footer className="lp-footer">
          <span>Telemetry Engine</span>
          <span>Real-time telemetry, alerts and diagnostics</span>
        </footer>
      </section>
    </div>
  );
}
