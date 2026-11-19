import React, { useMemo, useState } from "react";
import { Server, Layers, Clock, Thermometer, Cpu, Radio } from "lucide-react";
import { useRecentMetrics } from "../hooks/useRecentMetrics";
import { Card, Chip, Ico, Stat, Empty, LineGraph, Modal } from "./ui";
import { timeAgo, metricType, metricValue } from "./format";

// Sensors: every sensor that reported among the account's 100 most recent
// readings, each in its own card with its latest value.

const RECENT = 100;
const TYPE_ICONS = { temperature: Thermometer, cpu: Cpu, network: Radio };
const QUIET_AFTER = 5 * 60 * 1000; // a sensor is "reporting" if it sent something in the last five minutes

export function SensorsView({ stats }) {
  const { metrics, loading, error, reload } = useRecentMetrics(RECENT);
  const [openId, setOpenId] = useState(null);

  // Readings arrive newest first, so the first one seen for a sensor is its latest.
  const sensors = useMemo(() => {
    const byId = new Map();
    metrics.forEach((m) => {
      if (!byId.has(m.sensor_id)) byId.set(m.sensor_id, { id: m.sensor_id, latest: m, readings: [] });
      byId.get(m.sensor_id).readings.push(m);
    });
    // Sensors the stats endpoint lists but whose readings fell outside this page of results.
    (stats?.recent_sensors || []).forEach((id) => {
      if (!byId.has(id)) byId.set(id, { id, latest: null, readings: [] });
    });
    return [...byId.values()];
  }, [metrics, stats]);

  const types = [...new Set(metrics.map((m) => m.metric_type))];
  const newest = metrics[0];
  const open = sensors.find((s) => s.id === openId);
  // Oldest first for the graph.
  const openReadings = open ? [...open.readings].reverse() : [];
  const openType = open?.latest ? metricType(open.latest.metric_type) : null;

  return (
    <div className="page">
      <div className="g3">
        <Stat label="Sensors reporting" value={sensors.length} sub={<>Among your last <b>{RECENT}</b> readings</>} icon={Server} tone="gd" />
        <Stat label="Reading types" value={types.length} sub={types.length ? <b>{types.map((t) => metricType(t).label).join(", ")}</b> : "None yet"} icon={Layers} tone="dk" />
        <Stat
          label="Latest reading"
          value={newest ? timeAgo(newest.timestamp).replace(" ago", "") : "—"}
          unit={newest ? "ago" : ""}
          sub={newest ? <b className="mono">{newest.sensor_id}</b> : "Nothing received yet"}
          icon={Clock}
        />
      </div>

      {error && <p className="note w" role="alert">{error}</p>}

      {sensors.length === 0 ? (
        <Card className="pad col f1">
          <Empty title={loading ? "Loading sensors…" : "No sensors have reported yet"}>
            {!loading && <span>Send a reading from Metrics Studio and its sensor appears here.</span>}
          </Empty>
        </Card>
      ) : (
        <div className="g3">
          {sensors.map((s) => {
            const m = s.latest;
            const reporting = m && Date.now() - new Date(m.timestamp).getTime() < QUIET_AFTER;
            return (
              <Card key={s.id} className="pad">
                <div className="row ac" style={{ gap: "calc(6 * var(--u))" }}>
                  <Ico icon={TYPE_ICONS[m?.metric_type] || Radio} tone="k" />
                  <span className="f1 mono cut" style={{ fontWeight: 600 }} title={s.id}>{s.id}</span>
                </div>
                <div className="row sensor-val">
                  <span>
                    <span className="sub">{m ? metricType(m.metric_type).label : "No recent reading"}</span>
                    <b className="t9" style={{ marginTop: "calc(2 * var(--u))" }}>{m ? metricValue(m) : "—"}</b>
                  </span>
                  <span className="sub r">{m ? timeAgo(m.timestamp) : ""}</span>
                </div>
                <div className="row ac" style={{ marginTop: "calc(7 * var(--u))" }}>
                  <Chip tone={reporting ? undefined : "n"}>{reporting ? "Reporting" : "Quiet"}</Chip>
                  <button type="button" className="vd r" onClick={() => setOpenId(s.id)} aria-label={`View details: ${s.id}`}>View details</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="row ac">
        <button type="button" className="vd" onClick={reload} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {open && (
        <Modal title={open.id} onClose={() => setOpenId(null)}>
          {openReadings.length === 0 ? (
            <p className="txt">This sensor has no readings among your {RECENT} most recent.</p>
          ) : (
            <>
              <dl className="st">
                <div><dt>Type</dt><dd>{openType.label}</dd></div>
                <div><dt>Latest</dt><dd>{metricValue(open.latest)}</dd></div>
                <div><dt>Readings</dt><dd>{openReadings.length}</dd></div>
                <div><dt>Last seen</dt><dd>{timeAgo(open.latest.timestamp)}</dd></div>
              </dl>
              <div className="chart" style={{ padding: 0, minHeight: "calc(100 * var(--u))" }}>
                <LineGraph
                  series={[{ name: openType.label, colour: "#1c7a2e", values: openReadings.map((m) => m.value) }]}
                  labels={openReadings.map((m) => new Date(m.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}
                  max={Math.max(...openReadings.map((m) => m.value)) * 1.25 || 1}
                  unit={open.latest.metric_type === "temperature" ? `°${open.latest.payload_data?.unit || "C"}` : openType.unit}
                  digits={1}
                  summary={`Readings from ${open.id}`}
                />
              </div>
              <p className="txt">This sensor's readings among your {RECENT} most recent.</p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
