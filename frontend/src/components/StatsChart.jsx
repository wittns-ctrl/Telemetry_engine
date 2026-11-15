import React, { useMemo, useState } from "react";
import { ChartLine } from "lucide-react";
import { GAUGES, STAT_PERIODS, STAT_SERIES, CHART_COLOURS } from "./dashboardData";

// One statistics chart for the five tracked metrics. Tabs pick the metric and
// a second set picks the period. Under the tabs sit the period's low, average,
// high and current values; the dashed line is the same warning level the gauge
// cards use. Hover or arrow keys read out any single point.

const W = 1000; // the plot is drawn in a 1000 by 300 box and stretched to fit
const H = 300;
const Y_STEPS = [1, 0.75, 0.5, 0.25, 0];

const withUnit = (v, unit) => `${Math.round(v)}${unit === "W" ? " W" : unit}`;

/** A time label for every point, newest last. */
function pointLabels(period, count, now) {
  return Array.from({ length: count }, (_, i) => {
    const back = count - 1 - i;
    const d = new Date(now);
    if (period === "24h") {
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() - back);
      return back === 0 ? "Now" : d.toLocaleTimeString("en-US", { hour: "numeric" });
    }
    d.setDate(d.getDate() - back);
    if (back === 0) return "Today";
    return period === "7d"
      ? d.toLocaleDateString("en-US", { weekday: "short" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
}

/** Which points get an x-axis label: about six, always including the newest. */
function labelledPoints(count) {
  if (count <= 8) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil((count - 1) / 6);
  const picks = [];
  for (let i = count - 1; i >= 0; i -= step) picks.unshift(i);
  return picks;
}

export function StatsChart() {
  const [metric, setMetric] = useState("cpu");
  const [period, setPeriod] = useState("24h");
  const [focus, setFocus] = useState(null);

  const gauge = GAUGES.find((g) => g.id === metric);
  const data = STAT_SERIES[metric][period];
  const count = data.length;
  const colour = CHART_COLOURS[metric];
  const labels = useMemo(() => pointLabels(period, count, new Date()), [period, count]);
  const ticks = labelledPoints(count);

  const low = Math.min(...data);
  const high = Math.max(...data);
  const avg = data.reduce((s, v) => s + v, 0) / count;
  const now = data[count - 1];

  const x = (i) => (i / (count - 1)) * W;
  const y = (v) => H - (v / gauge.max) * H;
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `M0,${H} L${line.split(" ").join(" L")} L${W},${H} Z`;
  const limitTop = (1 - gauge.warnAt / gauge.max) * 100;

  const pickPoint = (clientX, box) => {
    const share = (clientX - box.left) / box.width;
    setFocus(Math.min(count - 1, Math.max(0, Math.round(share * (count - 1)))));
  };
  const onKey = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const from = focus ?? count - 1;
    setFocus(Math.min(count - 1, Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const switchTo = (setter) => (value) => { setter(value); setFocus(null); };
  const chooseMetric = switchTo(setMetric);
  const choosePeriod = switchTo(setPeriod);

  const tip = focus === null ? null : {
    left: (focus / (count - 1)) * 100,
    top: (1 - data[focus] / gauge.max) * 100,
    text: withUnit(data[focus], gauge.unit),
    when: labels[focus],
  };

  return (
    <section className="ld-chart" aria-labelledby="lc-title" style={{ "--lc-colour": colour }}>
      <header className="lc-head">
        <ChartLine strokeWidth={2} aria-hidden="true" />
        <h2 id="lc-title">Statistics</h2>
        <div className="lc-periods" role="group" aria-label="Period">
          {STAT_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === period ? "is-on" : undefined}
              aria-pressed={p.id === period}
              onClick={() => choosePeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="lc-bar">
        <div className="lc-tabs" role="tablist" aria-label="Metric">
          {GAUGES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              id={`lc-tab-${g.id}`}
              aria-selected={g.id === metric}
              aria-controls="lc-panel"
              tabIndex={g.id === metric ? 0 : -1}
              className={g.id === metric ? "is-on" : undefined}
              onClick={() => chooseMetric(g.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                const i = GAUGES.findIndex((t) => t.id === metric);
                const next = GAUGES[(i + (e.key === "ArrowRight" ? 1 : GAUGES.length - 1)) % GAUGES.length];
                chooseMetric(next.id);
                document.getElementById(`lc-tab-${next.id}`)?.focus();
              }}
            >
              <i style={{ background: CHART_COLOURS[g.id] }} aria-hidden="true" />
              {g.title}
            </button>
          ))}
        </div>
        <dl className="lc-stats">
          <div><dt>Low</dt><dd>{withUnit(low, gauge.unit)}</dd></div>
          <div><dt>Avg</dt><dd>{withUnit(avg, gauge.unit)}</dd></div>
          <div><dt>High</dt><dd>{withUnit(high, gauge.unit)}</dd></div>
          <div><dt>Now</dt><dd>{withUnit(now, gauge.unit)}</dd></div>
        </dl>
      </div>

      <div className="lc-panel" id="lc-panel" role="tabpanel" aria-labelledby={`lc-tab-${metric}`}>
        <div className="lc-y" aria-hidden="true">
          {Y_STEPS.map((s) => (
            <span key={s} style={{ top: `${(1 - s) * 100}%` }}>{withUnit(s * gauge.max, gauge.unit)}</span>
          ))}
        </div>

        <div
          className="lc-plot"
          tabIndex={0}
          role="img"
          aria-label={`${gauge.title} ${gauge.label.toLowerCase()} over the last ${period}: low ${withUnit(low, gauge.unit)}, average ${withUnit(avg, gauge.unit)}, high ${withUnit(high, gauge.unit)}, now ${withUnit(now, gauge.unit)}. Use the arrow keys to read single points.`}
          onPointerMove={(e) => pickPoint(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setFocus(null)}
          onKeyDown={onKey}
          onBlur={() => setFocus(null)}
        >
          {Y_STEPS.map((s) => (
            <i key={s} className="lc-grid" style={{ top: `${(1 - s) * 100}%` }} aria-hidden="true" />
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={colour} stopOpacity="0.28" />
                <stop offset="1" stopColor={colour} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#lc-fill)" />
            <polyline points={line} fill="none" stroke={colour} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <i className="lc-limit" style={{ top: `${limitTop}%` }} aria-hidden="true">
            <span>Limit {withUnit(gauge.warnAt, gauge.unit)}</span>
          </i>
          {tip && (
            <>
              <i className="lc-guide" style={{ left: `${tip.left}%` }} aria-hidden="true" />
              <i className="lc-dot" style={{ left: `${tip.left}%`, top: `${tip.top}%` }} aria-hidden="true" />
              <span
                className={`lc-tip${tip.left > 80 ? " is-left" : tip.left < 20 ? " is-right" : ""}`}
                style={{ left: `${tip.left}%`, top: `${tip.top}%` }}
                role="status"
              >
                <b>{tip.text}</b>
                {tip.when}
              </span>
            </>
          )}
        </div>

        <div className="lc-x" aria-hidden="true">
          {ticks.map((i) => (
            <span
              key={i}
              className={i === 0 ? "is-first" : i === count - 1 ? "is-last" : undefined}
              style={{ left: `${(i / (count - 1)) * 100}%` }}
            >
              {labels[i]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
