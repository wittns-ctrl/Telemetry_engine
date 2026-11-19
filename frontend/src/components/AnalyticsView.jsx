import React, { useEffect, useMemo, useState } from "react";
import { ChartLine, ChartPie, Gauge as GaugeIcon, TrendingUp, Database, Bell, ListOrdered } from "lucide-react";
import { useDeviceStream } from "../hooks/useDeviceStream";
import { fetchMetricsTrend, fetchDeviceAlerts } from "../services/api";
import { GROUPS, show } from "./readings";
import { Card, Head, Chip, Stat, Seg, LineGraph } from "./ui";
import { DeviceBar, StreamStatus } from "./live";
import { cx } from "./format";

// Analytics: how one PC's main readings moved over the last day, week or
// month (averages and peaks per hour or day, worked out by the API), the
// totals for that period, and the alerts it raised.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const PERIODS = [
  { id: "24h", label: "24h", buckets: 24, width: HOUR },
  { id: "7d", label: "7d", buckets: 7, width: DAY },
  { id: "30d", label: "30d", buckets: 30, width: DAY },
];
// The readings the API summarises (TREND_FIELDS in app/api/v1/metrics.py).
const TREND_IDS = ["cpu_util", "cpu_core_temp", "cpu_package_temp", "cpu_clock", "gpu_util", "gpu_core_temp", "gpu_hotspot", "ram_usage", "ram_pagefile", "vrm_temp", "psu_12v"];
const BY_ID = Object.fromEntries(GROUPS.flatMap((g) => g.readings.map((r) => [r.id, { ...r, group: g }])));
const SEVERITIES = [
  { id: "CRITICAL", label: "Critical", colour: "#c70036" },
  { id: "WARNING", label: "Warning", colour: "#0e0e10" },
  { id: "INFO", label: "Info", colour: "#5cc061" },
];

/** The start of every bucket in the period, oldest first, in UTC like the API's. */
function bucketStarts(period) {
  const end = new Date();
  if (period.width === HOUR) end.setUTCMinutes(0, 0, 0);
  else end.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: period.buckets }, (_, i) => end.getTime() - (period.buckets - 1 - i) * period.width);
}

function bucketLabel(period, start, isLast) {
  const d = new Date(start);
  if (period.width === HOUR) return isLast ? "Now" : d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (isLast) return "Today";
  return period.buckets === 7
    ? d.toLocaleDateString("en-US", { weekday: "short" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AnalyticsView({ onNavigate }) {
  const stream = useDeviceStream({ windowMs: 0, maxPoints: 1 });
  const { deviceId } = stream;
  const [periodId, setPeriodId] = useState("24h");
  const [readingId, setReadingId] = useState("cpu_util");
  const [trend, setTrend] = useState({ status: "loading", buckets: [] });
  const [alerts, setAlerts] = useState([]);

  const period = PERIODS.find((p) => p.id === periodId);

  useEffect(() => {
    if (!deviceId) return undefined;
    let cancelled = false;
    setTrend({ status: "loading", buckets: [] });
    const since = new Date(Date.now() - period.buckets * period.width);
    Promise.all([
      fetchMetricsTrend(deviceId, periodId),
      fetchDeviceAlerts(deviceId, { start: since, limit: 500 }).catch(() => null),
    ])
      .then(([data, alertData]) => {
        if (cancelled) return;
        setTrend({ status: "ready", buckets: data?.buckets || [] });
        setAlerts(alertData?.alerts || []);
      })
      .catch((err) => !cancelled && setTrend({ status: "error", error: err.message, buckets: [] }));
    return () => {
      cancelled = true;
    };
  }, [deviceId, periodId, period]);

  // Readings this PC reported at least once in the period; the rest are hidden.
  const available = useMemo(
    () => TREND_IDS.filter((id) => trend.buckets.some((b) => b.readings?.[id]?.avg !== null && b.readings?.[id]?.avg !== undefined)),
    [trend.buckets],
  );
  useEffect(() => {
    if (available.length && !available.includes(readingId)) setReadingId(available[0]);
  }, [available, readingId]);

  const graph = useMemo(() => {
    const starts = bucketStarts(period);
    const byStart = new Map(trend.buckets.map((b) => [new Date(b.start).getTime(), b]));
    const rows = starts.map((t) => byStart.get(t) || null);
    const avg = rows.map((b) => b?.readings?.[readingId]?.avg ?? null);
    const peak = rows.map((b) => b?.readings?.[readingId]?.max ?? null);
    const counts = rows.map((b) => b?.count || 0);
    const present = avg.filter((v) => v !== null);
    const peaks = peak.filter((v) => v !== null);
    return {
      avg, peak, counts,
      labels: starts.map((t, i) => bucketLabel(period, t, i === starts.length - 1)),
      mean: present.length ? present.reduce((a, b) => a + b, 0) / present.length : null,
      high: peaks.length ? Math.max(...peaks) : null,
      snapshots: counts.reduce((a, b) => a + b, 0),
    };
  }, [trend.buckets, period, readingId]);

  const bySeverity = SEVERITIES.map((s) => ({ ...s, count: alerts.filter((a) => a.severity === s.id).length }));
  const rules = useMemo(() => {
    const counts = new Map();
    alerts.forEach((a) => counts.set(a.rule_name, (counts.get(a.rule_name) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [alerts]);

  const status = StreamStatus({ stream, onNavigate });
  if (status) return <div className="page">{status}</div>;

  const reading = BY_ID[readingId];
  const top = Math.max(reading.warnAt ?? 0, graph.high ?? 0, reading.max ?? 0) || 100;
  const share = (n) => (alerts.length ? (n / alerts.length) * 100 : 0);
  const periodText = periodId === "24h" ? "the last 24 hours" : `the last ${period.buckets} days`;

  return (
    <div className="page">
      <DeviceBar stream={stream} showConnection={false} />

      <Card className="chart" style={{ flex: 1, minHeight: "calc(118 * var(--u))" }}>
        <Head icon={ChartLine} title="Readings over time">
          <Seg items={PERIODS} value={periodId} onChange={setPeriodId} label="Period" />
        </Head>
        <div className="ch-bar">
          <div className="tabs" role="group" aria-label="Reading">
            {(available.length ? available : [readingId]).map((id) => (
              <button key={id} type="button" className={cx(id === readingId && "on")} aria-pressed={id === readingId} onClick={() => setReadingId(id)}>
                {BY_ID[id].group.label} · {BY_ID[id].label}
              </button>
            ))}
          </div>
        </div>
        {trend.status === "error" ? (
          <p className="note w" role="alert">{trend.error}</p>
        ) : (
          <LineGraph
            endTags
            series={[
              { name: "Average", colour: "#1c7a2e", values: graph.avg },
              { name: "Peak", colour: "#8e8e96", values: graph.peak },
            ]}
            labels={graph.labels}
            min={reading.min ?? 0}
            max={top}
            unit={(reading.unit || "").trim()}
            digits={reading.digits || 0}
            limit={reading.warnAt}
            emptyText={trend.status === "loading" ? "Loading readings" : "No readings in this period"}
            summary={`${reading.label} average and peak per ${period.width === HOUR ? "hour" : "day"} over ${periodText}`}
          />
        )}
        <p className="sub" style={{ margin: "calc(2 * var(--u)) 0 calc(4 * var(--u))" }}>
          Average and peak per {period.width === HOUR ? "hour" : "day"}, from every reading the agent sent in {periodText}.
        </p>
      </Card>

      <div className="g4">
        <Stat label="Average" value={graph.mean === null ? "—" : show(reading, graph.mean)} sub={<>{reading.group.label} · {reading.label}</>} icon={GaugeIcon} tone="gd" />
        <Stat label="Peak" value={graph.high === null ? "—" : show(reading, graph.high)} sub={reading.warnAt !== undefined ? <>Limit <b>{show(reading, reading.warnAt)}</b></> : "No limit set"} icon={TrendingUp} tone="dk" warn={reading.warnAt !== undefined && graph.high !== null && graph.high >= reading.warnAt} />
        <Stat label="Readings received" value={graph.snapshots.toLocaleString("en-US")} sub={`In ${periodText}`} icon={Database} tone="gs" />
        <Stat label="Alerts raised" value={alerts.length.toLocaleString("en-US")} sub={`In ${periodText}`} icon={Bell} />
      </div>

      <div className="g2">
        <Card className="pad col">
          <Head icon={ChartPie} title="Alerts by severity">
            <span className="sub">{alerts.length.toLocaleString("en-US")} in total</span>
          </Head>
          {alerts.length === 0 ? (
            <p className="txt">No alerts in {periodText}.</p>
          ) : (
            <>
              <div className="stack" role="img" aria-label={bySeverity.map((s) => `${s.label} ${s.count}`).join(", ")}>
                {bySeverity.map((s) => <i key={s.id} style={{ width: `${share(s.count)}%`, background: s.colour }} />)}
              </div>
              <div className="row wrap" style={{ gap: "calc(4 * var(--u)) calc(12 * var(--u))" }}>
                {bySeverity.map((s) => (
                  <span key={s.id} className="row ac" style={{ gap: "calc(4 * var(--u))" }}>
                    <i className="key" style={{ background: s.colour }} aria-hidden="true" />
                    <span style={{ fontWeight: 500 }}>{s.label}</span>
                    <span className="sub">{s.count} · {share(s.count).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="pad dk">
          <Head icon={ListOrdered} title="Most frequent alerts">
            <button type="button" className="vd" onClick={() => onNavigate?.("devices")}>Diagnose and fix</button>
          </Head>
          {rules.length === 0 ? (
            <p className="txt" style={{ marginTop: "calc(5 * var(--u))" }}>Nothing went over its limit in {periodText}.</p>
          ) : (
            <ul style={{ listStyle: "none", marginTop: "calc(2 * var(--u))" }}>
              {rules.map(([rule, count]) => (
                <li key={rule} className="li" style={{ padding: "calc(3.5 * var(--u)) 0" }}>
                  <span className="f1 mono cut">{rule}</span>
                  <Chip tone="n">{count === 1 ? "once" : `${count} times`}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
