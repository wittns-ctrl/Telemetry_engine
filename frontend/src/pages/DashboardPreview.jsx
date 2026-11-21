import React from 'react';
import { Bell, ChevronLeft, Fan, Gauge as GaugeIcon, LogOut, Search, Thermometer, ThermometerSun, Check } from 'lucide-react';
import { LectioMark } from '../components/LectioMark';
import { MAIN_ITEMS, OTHER_ITEMS } from '../components/navItems';
import { GROUPS, READING_COUNT } from '../components/readings';
import { Gauge, PromoArt, Ring } from '../components/ui';
import { SAMPLE_SNAPSHOT, SAMPLE_PLACES } from './previewData';
import { PREVIEW_MAP } from './previewMap';

/*
 * A static miniature of the signed-in Dashboard (CPU tab) for the landing
 * page's tablet, filled with the app's sample data. It mirrors the real
 * layout: black sidebar, component tabs, three reading cards, the
 * utilization gauge, Package Power, the Devices by Country map (drawn ahead
 * of time, see previewMap.js), Fan speed / Thermal throttling and the
 * Lectio AI card. Sizes are in --p: one pixel of the 1280px-wide dashboard.
 */

const cpu = SAMPLE_SNAPSHOT.cpu;
// The map's shading: the healthiest country, the next two, then the rest
// (as DeviceMap does).
const SHADES = ['#1c7a2e', '#5cc061', '#b5dfbe'];
const PLACES = SAMPLE_PLACES.map((p, i) => ({ ...p, colour: SHADES[i === 0 ? 0 : i < 3 ? 1 : 2] }));
const SHADE_OF = Object.fromEntries(PLACES.map((p) => [p.country, p.colour]));
const PICKED = PLACES[0];

const STATS = [
  { tone: 'gd', label: 'Core temperature', value: cpu.core_temperature_c, unit: '°C', delta: '▼ 4.1%', icon: Thermometer },
  { tone: 'dk', label: 'Package temperature', value: cpu.package_temperature_c, unit: '°C', delta: '▲ 1.2%', icon: ThermometerSun },
  { tone: '', label: 'Clock speed', value: cpu.clock_speed_ghz, unit: ' GHz', delta: '▲ 2.4%', icon: GaugeIcon },
];

function PreviewMap() {
  const { width: W, height: H, countries, labels, pins } = PREVIEW_MAP;
  const [px, py] = pins[PICKED.country];
  return (
    <svg className="pv-geo" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      <rect x={-60} y={-60} width={W + 120} height={H + 120} fill="#ffffff" />
      {countries.map((c) => (
        <path key={c.name} d={c.d} fill={SHADE_OF[c.name] || '#e3e3e5'} stroke="#ffffff" strokeWidth="0.8" />
      ))}
      {labels.map((l) => (
        <text key={l.text} x={l.at[0]} y={l.at[1]} className="pv-geo-label">{l.text}</text>
      ))}
      {Object.entries(pins).map(([name, [x, y]]) => (
        <circle
          key={name} cx={x} cy={y} r={name === PICKED.country ? 6 : 4.2}
          fill="#fff" stroke={SHADE_OF[name]} strokeWidth={name === PICKED.country ? 2.8 : 2.2}
        />
      ))}
      <g transform={`translate(${px + 10} ${py - 14})`}>
        <rect width="62" height="28" rx="5" fill="#0e0e10" />
        <text x="7" y="12" className="pv-geo-tip-b">{PICKED.country}</text>
        <text x="7" y="22" className="pv-geo-tip-s">Healthy</text>
        <text x="55" y="17.5" className="pv-geo-tip-v" textAnchor="end">{PICKED.health}%</text>
      </g>
    </svg>
  );
}

export function DashboardPreview() {
  return (
    <div className="pv" aria-hidden="true">
      <aside className="pv-side">
        <div className="pv-brand">
          <LectioMark size="calc(26 * var(--p))" on="dark" />
          <span>Lectio</span>
          <i className="pv-toggle"><ChevronLeft /></i>
        </div>
        <div className="pv-cap">Main menu</div>
        {MAIN_ITEMS.map(({ id, label, icon: Icon }, i) => (
          <div key={id} className={`pv-nav${i === 0 ? ' on' : ''}`}><i><Icon /></i>{label}</div>
        ))}
        <div className="pv-cap">Others</div>
        {OTHER_ITEMS.map(({ id, label, icon: Icon }) => (
          <div key={id} className="pv-nav"><i><Icon /></i>{label}</div>
        ))}
        <div className="pv-acct">
          <div className="pv-cap">User account</div>
          <div className="pv-who">
            <span className="pv-ava">AM</span>
            <span><b>Alex Morgan</b><small>Account settings</small></span>
            <LogOut />
          </div>
        </div>
      </aside>

      <div className="pv-panel">
        <div className="pv-top">
          <h3>Dashboard</h3>
          <span className="pv-search"><Search />Search devices, metrics, alerts…</span>
          <span className="pv-bell"><Bell /></span>
        </div>

        <div className="pv-tabs">
          {GROUPS.map(({ id, label, icon: Icon, readings }, i) => (
            <span key={id} className={i === 0 ? 'on' : undefined}><Icon />{label}<em>{readings.length}</em></span>
          ))}
          <small>Office PC · updated just now</small>
        </div>

        <div className="pv-stats">
          {STATS.map(({ tone, label, value, unit, delta, icon: Icon }) => (
            <div key={label} className={`pv-card pv-stat ${tone}`}>
              <span>CPU · {label}</span>
              <b>{value}<small>{unit}</small></b>
              <em><strong>{delta}</strong> vs 24h average</em>
              <i><Icon /></i>
              <u>View details</u>
            </div>
          ))}
        </div>

        <div className="pv-mid">
          <div className="pv-card gs pv-gauge">
            <h4>CPU Utilization</h4>
            <b>{cpu.utilization_percent}<small>%</small></b>
            <Gauge share={cpu.utilization_percent / 100} />
            <span>Average over 24h <strong>41%</strong></span>
            <u>View Details</u>
          </div>
          <div className="pv-card dk pv-big">
            <h4>Package Power</h4>
            <b>{cpu.package_power_w}<small> W</small></b>
            <div><i />Low<em>42 W</em></div>
            <div><i />Average<em>58 W</em></div>
            <div><i />High<em>88 W</em></div>
            <u>View Details</u>
          </div>
          <div className="pv-card pv-map">
            <div className="pv-places">
              <h4>Devices by Country</h4>
              <p>Countries shaded by the share of each PC's readings that are within their limits.</p>
              {PLACES.map((p) => (
                <div key={p.country} className={p === PICKED ? 'on' : undefined}>
                  <i style={{ background: p.colour }} />{p.country}<em>{p.health}%</em>
                </div>
              ))}
              <u>View details</u>
            </div>
            <div className="pv-geo-box">
              <PreviewMap />
              <span className="pv-geo-all">Show all</span>
              <span className="pv-geo-zoom"><span>+</span><span>−</span></span>
              <span className="pv-geo-attr">OpenFreeMap © OpenMapTiles Data from OpenStreetMap</span>
            </div>
          </div>
        </div>

        <div className="pv-low">
          <div className="pv-pills">
            <div className="pv-pill dk">
              <Ring share={cpu.fan_speed_rpm / 2500} tone="dark"><Fan /></Ring>
              <span><b>Fan speed</b><small>{cpu.fan_speed_rpm.toLocaleString('en-US')} RPM · Revolutions per minute of the CPU fan.</small></span>
              <u>View details</u>
            </div>
            <div className="pv-pill gs">
              <Ring share={1} tone="soft"><Check /></Ring>
              <span><b>Thermal throttling</b><small>Off · Not throttling</small></span>
              <u>View details</u>
            </div>
          </div>
          <div className="pv-card pv-promo">
            <PromoArt />
            <span className="pv-promo-brand"><LectioMark size="calc(16 * var(--p))" on="dark" />Lectio AI</span>
            <span className="pv-promo-go">↗</span>
            <span className="pv-promo-title">Let Lectio diagnose<br />your PC</span>
            <span className="pv-tag a">AI Diagnosis</span>
            <span className="pv-tag b">Fixes</span>
            <span className="pv-promo-foot">{READING_COUNT} readings watched</span>
          </div>
        </div>
      </div>
    </div>
  );
}
