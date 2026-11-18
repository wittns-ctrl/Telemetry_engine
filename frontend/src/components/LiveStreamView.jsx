import React, { useMemo, useState } from "react";
import { Thermometer, Cpu, Radio, Bell, TriangleAlert } from "lucide-react";
import { Card, Head, Chip, Ico, LineGraph, Modal } from "./ui";
import { cx, fmt, METRIC_TYPES } from "./format";

// Live Monitor: a status bar, one small graph per reading type, and the alerts
// list underneath. Readings and alerts arrive by themselves over the WebSocket
// (in frontend-only mode App.jsx makes them up while this page is open).

const TYPE_ICONS = { temperature: Thermometer, cpu: Cpu, network: Radio };
const DEFAULT_LIMITS = { temperature: 100, cpu: 90, network: 1000 };

export function LiveStreamView({
  liveMetrics = [],
  thresholds,
  alerts = [],
  clearAlerts,
  dismissAlert,
  status = "offline", // "live" | "connecting" | "offline"
}) {
  const live = status === "live";
  const [sensor, setSensor] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);

  const sensors = useMemo(() => [...new Set(liveMetrics.map((m) => m.sensor_id).filter(Boolean))], [liveMetrics]);

  // One series per reading type, filtered to the chosen sensor.
  const streams = useMemo(() => Object.fromEntries(METRIC_TYPES.map((type) => {
    const points = liveMetrics.filter((m) => m.metric_type === type.id && (sensor === "all" || m.sensor_id === sensor));
    const limit = thresholds?.[type.id]?.max || DEFAULT_LIMITS[type.id];
    const values = points.map((m) => m.value);
    const latest = points[points.length - 1];
    const unit = type.id === "temperature" ? `°${latest?.payload_data?.unit || "C"}` : type.unit;
    return [type.id, {
      type, limit, values, latest, unit,
      labels: points.map((m) => m.timeLabel),
      max: Math.max(limit * 1.25, ...values),
      breaches: values.filter((v) => v > limit).length,
    }];
  })), [liveMetrics, sensor, thresholds]);

  const shownAlerts = alerts.filter((a) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [a.sensor_id, a.metric_type, a.message].some((text) => text && text.toLowerCase().includes(q));
  });

  const open = expanded ? streams[expanded] : null;

  return (
    <div className="page">
      <Card className="row ac wrap dk live-bar">
        <i className={cx("dot", !live && "off")} aria-hidden="true" />
        <b className="t7" role="status">{live ? "Live" : status === "connecting" ? "Connecting…" : "Offline"}</b>
        <span className="sub">{live ? "Receiving readings automatically" : "Readings appear here as soon as the connection is back"}</span>
        <span className="sub r">
          {liveMetrics.length} recent readings · <b style={{ color: "#fff" }}>{alerts.length}</b> over their limit
        </span>
        <select className="inp" style={{ width: "auto" }} aria-label="Sensor" value={sensor} onChange={(e) => setSensor(e.target.value)}>
          <option value="all">All sensors</option>
          {sensors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Card>

      <div className="g3">
        {METRIC_TYPES.map((type) => {
          const s = streams[type.id];
          return (
            <Card key={type.id} className="pad col" style={{ gap: "calc(4 * var(--u))" }}>
              <Head icon={TYPE_ICONS[type.id]} title={type.label}>
                {live && <Chip>Live</Chip>}
              </Head>
              <div className="val" style={{ marginTop: 0 }}>{s.latest ? fmt(s.latest.value, 1) : "—"}<small> {s.unit.trim()}</small></div>
              <div className="chart live-plot">
                <LineGraph
                  bare
                  series={[{ name: type.label, colour: "#1c7a2e", values: s.values }]}
                  labels={s.labels}
                  max={s.max}
                  unit={s.unit}
                  digits={1}
                  limit={s.limit}
                  emptyText="Waiting for readings"
                  summary={`${type.label} readings as they arrive`}
                />
              </div>
              <div className="row ac">
                <span className="sub">{s.values.length} readings · {s.breaches} over the limit</span>
                <button type="button" className="vd r" onClick={() => setExpanded(type.id)} aria-label={`View details: ${type.label}`}>View details</button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="pad col f1">
        <Head icon={Bell} title="Alerts">
          {alerts.length > 0 && <Chip tone="w">{alerts.length} open</Chip>}
          {alerts.length > 0 && <button type="button" className="vd" onClick={clearAlerts}>Clear stream</button>}
        </Head>
        {alerts.length > 3 && (
          <input
            className="inp" type="search" placeholder="Search alerts by sensor, type or message" aria-label="Search alerts"
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {shownAlerts.length === 0 ? (
          <p className="txt">{alerts.length ? "No alerts match your search." : "No active threshold breaches. Readings are within their limits."}</p>
        ) : (
          <ul className="alert-list">
            {shownAlerts.map((a) => (
              <li key={a.id} className="li">
                <Ico icon={TriangleAlert} tone="w" />
                <span className="f1">
                  {a.message}
                  <small>
                    {a.severity || "CRITICAL"} · <span className="mono">{a.sensor_id}</span> · {a.metric_type} · reading {a.current_value}{a.unit} · limit {a.threshold_max}{a.unit}
                  </small>
                </span>
                <time className="sub" dateTime={a.receivedAt}>{new Date(a.receivedAt || Date.now()).toLocaleTimeString()}</time>
                <button type="button" className="vd" onClick={() => dismissAlert(a.id)} aria-label={`Dismiss alert from ${a.sensor_id}`}>Dismiss</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && (
        <Modal title={`${open.type.label} · live readings`} onClose={() => setExpanded(null)}>
          <dl className="st">
            <div><dt>Latest</dt><dd>{open.latest ? fmt(open.latest.value, 1, open.unit) : "—"}</dd></div>
            <div><dt>Limit</dt><dd>{fmt(open.limit, 0, open.unit)}</dd></div>
            <div><dt>Readings</dt><dd>{open.values.length}</dd></div>
            <div><dt>Over the limit</dt><dd>{open.breaches}</dd></div>
          </dl>
          <div className="chart" style={{ padding: 0, minHeight: "calc(120 * var(--u))" }}>
            <LineGraph
              series={[{ name: open.type.label, colour: "#1c7a2e", values: open.values }]}
              labels={open.labels}
              max={open.max}
              unit={open.unit}
              digits={1}
              limit={open.limit}
              emptyText="Waiting for readings"
              summary={`${open.type.label} readings as they arrive`}
            />
          </div>
          <p className="txt">{sensor === "all" ? "All sensors." : <>Sensor <span className="mono">{sensor}</span>.</>} The last {open.values.length} readings received while this page has been open.</p>
        </Modal>
      )}
    </div>
  );
}
