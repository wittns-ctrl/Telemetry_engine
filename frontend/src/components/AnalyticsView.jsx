import React, { useMemo, useState } from "react";
import { ChartLine, ChartPie, Database, Thermometer, Cpu, Radio, Server } from "lucide-react";
import { useRecentMetrics } from "../hooks/useRecentMetrics";
import { Card, Head, Chip, Stat, Seg, LineGraph } from "./ui";
import { cx, METRIC_TYPES, metricType } from "./format";

// Analytics: a wide graph of how many readings arrived over time, the totals
// by reading type, then how the readings split by type and which sensors sent
// the most.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const FETCH_LIMIT = 1000; // the most the API returns in one request
const PERIODS = [
  { id: "24h", label: "24h", buckets: 24, width: HOUR },
  { id: "7d", label: "7d", buckets: 7, width: DAY },
  { id: "30d", label: "30d", buckets: 30, width: DAY },
];
const TYPE_ICONS = { temperature: Thermometer, cpu: Cpu, network: Radio };
const TYPE_COLOURS = { temperature: "#1c7a2e", cpu: "#5cc061", network: "#0e0e10" };
const TABS = [{ id: "all", label: "All" }, ...METRIC_TYPES];
// Card fills for the totals row: brand green, black, soft green, white.
const TONES = ["gd", "dk", "gs", undefined];

function bucketLabel(period, start, isLast) {
  const d = new Date(start);
  if (period.width === HOUR) return isLast ? "Now" : d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (isLast) return "Today";
  return period.buckets === 7
    ? d.toLocaleDateString("en-US", { weekday: "short" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AnalyticsView({ stats, thresholds, onNavigate }) {
  const [periodId, setPeriodId] = useState("24h");
  const [type, setType] = useState("all");
  const { metrics, loading } = useRecentMetrics(FETCH_LIMIT);

  const totals = stats;
  const total = totals?.total_metrics || 0;
  const share = (n) => (total ? (n / total) * 100 : 0);
  const recent = metrics.length >= FETCH_LIMIT ? `latest ${FETCH_LIMIT.toLocaleString("en-US")}` : metrics.length.toLocaleString("en-US");

  const graph = useMemo(() => {
    const period = PERIODS.find((p) => p.id === periodId);
    // Buckets end at the close of the current hour or day.
    const end = new Date();
    if (period.width === HOUR) end.setMinutes(60, 0, 0);
    else end.setHours(24, 0, 0, 0);
    const first = end.getTime() - period.buckets * period.width;
    const counts = Array(period.buckets).fill(0);
    let breaches = 0;
    metrics.forEach((m) => {
      if (type !== "all" && m.metric_type !== type) return;
      const i = Math.floor((new Date(m.timestamp).getTime() - first) / period.width);
      if (i < 0 || i >= period.buckets) return;
      counts[i] += 1;
      const limit = thresholds?.[m.metric_type]?.max;
      if (limit !== undefined && m.value > limit) breaches += 1;
    });
    const labels = counts.map((_, i) => bucketLabel(period, first + i * period.width, i === period.buckets - 1));
    const peak = Math.max(...counts);
    return {
      counts, labels, breaches,
      sum: counts.reduce((a, b) => a + b, 0),
      busiest: peak > 0 ? labels[counts.indexOf(peak)] : "—",
      max: Math.max(4, Math.ceil((peak * 1.25) / 4) * 4),
    };
  }, [metrics, periodId, type, thresholds]);

  // The sensors that sent the most of the recent readings.
  const busiest = useMemo(() => {
    const byId = new Map();
    metrics.forEach((m) => {
      const entry = byId.get(m.sensor_id) || { id: m.sensor_id, type: m.metric_type, count: 0 };
      entry.count += 1;
      byId.set(m.sensor_id, entry);
    });
    return [...byId.values()].sort((a, b) => b.count - a.count).slice(0, 4);
  }, [metrics]);

  return (
    <div className="page">
      <Card className="chart" style={{ flex: 1, minHeight: "calc(118 * var(--u))" }}>
        <Head icon={ChartLine} title="Readings over time">
          <Seg items={PERIODS} value={periodId} onChange={setPeriodId} label="Period" />
        </Head>
        <div className="ch-bar">
          <div className="tabs" role="group" aria-label="Reading type">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={cx(t.id === type && "on")} aria-pressed={t.id === type} onClick={() => setType(t.id)}>{t.label}</button>
            ))}
          </div>
          <dl className="st">
            <div><dt>In this period</dt><dd>{graph.sum.toLocaleString("en-US")}</dd></div>
            <div><dt>Busiest</dt><dd>{graph.busiest}</dd></div>
            <div><dt>Over their limit</dt><dd>{graph.breaches}</dd></div>
          </dl>
        </div>
        <LineGraph
          series={[{ name: "Readings", colour: "#1c7a2e", values: graph.counts }]}
          labels={graph.labels}
          max={graph.max}
          emptyText={loading ? "Loading readings" : "No readings in this period"}
          summary={`Readings stored per ${periodId === "24h" ? "hour" : "day"} over the last ${periodId}`}
        />
        <p className="sub" style={{ margin: "calc(2 * var(--u)) 0 calc(4 * var(--u))" }}>
          Counted from your {recent} stored readings.
        </p>
      </Card>

      <div className="g4">
        <Stat label="All readings" value={total.toLocaleString("en-US")} sub="Stored on your account" icon={Database} tone={TONES[0]} />
        {METRIC_TYPES.map((t, i) => {
          const count = totals?.by_type?.[t.id] || 0;
          return <Stat key={t.id} label={t.label} value={count.toLocaleString("en-US")} sub={<><b>{share(count).toFixed(1)}%</b> of all</>} icon={TYPE_ICONS[t.id]} tone={TONES[i + 1]} />;
        })}
      </div>

      <div className="g2">
        <Card className="pad col">
          <Head icon={ChartPie} title="Readings by type">
            <span className="sub">{total.toLocaleString("en-US")} in total</span>
          </Head>
          <div
            className="stack"
            role="img"
            aria-label={METRIC_TYPES.map((t) => `${t.label} ${share(totals?.by_type?.[t.id] || 0).toFixed(0)}%`).join(", ")}
          >
            {METRIC_TYPES.map((t) => <i key={t.id} style={{ width: `${share(totals?.by_type?.[t.id] || 0)}%`, background: TYPE_COLOURS[t.id] }} />)}
          </div>
          <div className="row wrap" style={{ gap: "calc(4 * var(--u)) calc(12 * var(--u))" }}>
            {METRIC_TYPES.map((t) => {
              const count = totals?.by_type?.[t.id] || 0;
              return (
                <span key={t.id} className="row ac" style={{ gap: "calc(4 * var(--u))" }}>
                  <i className="key" style={{ background: TYPE_COLOURS[t.id] }} aria-hidden="true" />
                  <span style={{ fontWeight: 500 }}>{t.label}</span>
                  <span className="sub">{count.toLocaleString("en-US")} · {share(count).toFixed(1)}%</span>
                </span>
              );
            })}
          </div>
        </Card>

        <Card className="pad dk">
          <Head icon={Server} title="Busiest sensors">
            <span className="sub">of your {recent} readings</span>
            <button type="button" className="vd" onClick={() => onNavigate?.("sensors")}>View all</button>
          </Head>
          {busiest.length === 0 ? (
            <p className="txt" style={{ marginTop: "calc(5 * var(--u))" }}>{loading ? "Loading sensors…" : "No sensors have reported yet."}</p>
          ) : (
            <ul style={{ listStyle: "none", marginTop: "calc(2 * var(--u))" }}>
              {busiest.map((s) => (
                <li key={s.id} className="li" style={{ padding: "calc(3.5 * var(--u)) 0" }}>
                  <span className="f1 mono cut">{s.id}</span>
                  <Chip tone="n">{metricType(s.type).label}</Chip>
                  <b>{s.count}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
