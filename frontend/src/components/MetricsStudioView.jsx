import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Thermometer, Cpu, Radio, Send } from "lucide-react";
import { BACKEND_DISABLED, fetchMetrics, ingestMetric } from "../services/api";
import { SAMPLE_METRICS, SAMPLE_THRESHOLDS, statsOf } from "./sampleData";
import { Card, Head, Chip, Stat, Field, Empty, Modal } from "./ui";
import { cx, METRIC_TYPES, metricType, metricValue } from "./format";

// Metrics Studio: totals on top, the stored readings in a table, and a narrow
// form on the right for sending one reading by hand.

const TYPE_ICONS = { temperature: Thermometer, cpu: Cpu, network: Radio };

// One-click test readings; the "breach" ones go over the alert limit.
const PRESETS = [
  { id: "temp_normal", label: "Normal temperature", type: "temperature", sensorId: "sensor_room_204", value: 24.5, unit: "C" },
  { id: "temp_breach", label: "Temperature breach", type: "temperature", sensorId: "sensor_datacenter_rack_a", value: 118.4, unit: "C" },
  { id: "cpu_normal", label: "Normal CPU", type: "cpu", sensorId: "sensor_k8s_node_02", value: 42.0, coreCount: 16, processCount: 180 },
  { id: "cpu_breach", label: "CPU breach", type: "cpu", sensorId: "sensor_core_api_pod", value: 98.6, coreCount: 32, processCount: 520 },
  { id: "net_normal", label: "Normal network", type: "network", sensorId: "sensor_edge_router_01", value: 240.0, bytesSent: 52428800, bytesRecv: 104857600 },
  { id: "net_breach", label: "Network breach", type: "network", sensorId: "sensor_gateway_primary", value: 1850.0, bytesSent: 890000000, bytesRecv: 1920000000 },
];

const DEFAULT_FORM = { type: "temperature", sensorId: "sensor_server_101", value: 38.5, unit: "C", coreCount: 8, processCount: 142, bytesSent: 124500, bytesRecv: 982000 };

/** The request body for the reading in the form: the fields depend on its type. */
function buildPayload(form) {
  const base = { sensor_id: form.sensorId, metric_type: form.type, value: Number(form.value) };
  if (form.type === "temperature") return { ...base, unit: form.unit };
  if (form.type === "cpu") return { ...base, core_count: Number(form.coreCount), process_count: Number(form.processCount) };
  return { ...base, bytes_sent: Number(form.bytesSent), bytes_recv: Number(form.bytesRecv) };
}

function TypeChips({ value, onChange, label, withAll }) {
  const items = withAll ? [{ id: "all", label: "All" }, ...METRIC_TYPES] : METRIC_TYPES;
  return (
    <span className="row" role="group" aria-label={label} style={{ gap: "calc(3 * var(--u))", flexWrap: "wrap" }}>
      {items.map((t) => (
        <button key={t.id} type="button" className={cx("chip", t.id === value ? "k" : "o")} aria-pressed={t.id === value} onClick={() => onChange(t.id)}>
          {t.id === "cpu" && !withAll ? "CPU" : t.label}
        </button>
      ))}
    </span>
  );
}

export function MetricsStudioView({ stats, onRefreshStats }) {
  // ---- stored readings
  const [fetched, setFetched] = useState([]);
  const [local, setLocal] = useState(() => (BACKEND_DISABLED ? SAMPLE_METRICS : null)); // frontend-only mode
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sensorDraft, setSensorDraft] = useState("");
  const [sensorFilter, setSensorFilter] = useState("");
  const [limit, setLimit] = useState(50);
  const [inspected, setInspected] = useState(null);

  const loadData = useCallback(async () => {
    if (BACKEND_DISABLED) return;
    setLoading(true);
    try {
      const data = await fetchMetrics({
        limit,
        metricType: typeFilter !== "all" ? typeFilter : null,
        sensorId: sensorFilter.trim() || null,
      });
      setFetched(data);
      onRefreshStats?.();
    } catch (err) {
      console.error("Failed to load stored readings:", err);
    } finally {
      setLoading(false);
    }
  }, [limit, typeFilter, sensorFilter, onRefreshStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rows = useMemo(() => {
    if (!local) return fetched;
    const wanted = sensorFilter.trim().toLowerCase();
    return local
      .filter((m) => (typeFilter === "all" || m.metric_type === typeFilter) && (!wanted || m.sensor_id.toLowerCase().includes(wanted)))
      .slice(0, limit);
  }, [local, fetched, typeFilter, sensorFilter, limit]);

  const totals = local ? statsOf(local) : stats;
  const total = totals?.total_metrics || 0;
  const share = (n) => (total ? `${((n / total) * 100).toFixed(1)}%` : "0%");

  // ---- send a reading
  const [form, setForm] = useState(DEFAULT_FORM);
  const [sending, setSending] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const clearResult = () => { setLastResponse(null); setErrorMsg(null); };

  const applyPreset = (id) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    clearResult();
    const { id: _id, label: _label, ...values } = preset;
    setForm((prev) => ({ ...prev, ...values }));
  };

  const handleIngest = async (e) => {
    e.preventDefault();
    setSending(true);
    clearResult();
    const payload = buildPayload(form);
    try {
      if (local) {
        // Frontend-only mode: keep the reading in this page instead of sending it.
        const { sensor_id, metric_type, value, ...payload_data } = payload;
        const record = { id: `local-${Date.now()}`, sensor_id, metric_type, value, payload_data, timestamp: new Date().toISOString() };
        setLocal((prev) => [record, ...prev]);
        setLastResponse({ metric_id: record.id, alert_triggered: value > SAMPLE_THRESHOLDS[metric_type].max });
      } else {
        setLastResponse(await ingestMetric(payload));
        loadData();
      }
    } catch (err) {
      setErrorMsg(err.message || "Couldn't send the reading");
    } finally {
      setSending(false);
    }
  };

  const unit = form.type === "temperature" ? `°${form.unit}` : metricType(form.type).unit.trim();

  return (
    <div className="page">
      <div className="g4">
        <Stat label="Stored readings" value={total.toLocaleString("en-US")} sub={BACKEND_DISABLED ? "Sample data" : "On your account"} icon={Database} tone="gd" />
        {METRIC_TYPES.map((t, i) => {
          const count = totals?.by_type?.[t.id] || 0;
          return <Stat key={t.id} tone={["dk", "gs", undefined][i]} label={t.label} value={count.toLocaleString("en-US")} sub={<><b>{share(count)}</b> of all</>} icon={TYPE_ICONS[t.id]} />;
        })}
      </div>

      <div className="row stack-sm" style={{ flex: 1, alignItems: "flex-start" }}>
        <Card className="pad col f1">
          <Head icon={Database} title="Stored readings">
            <TypeChips value={typeFilter} onChange={setTypeFilter} label="Reading type" withAll />
            {!BACKEND_DISABLED && <button type="button" className="vd" onClick={loadData} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>}
          </Head>
          <form
            className="row ac"
            onSubmit={(e) => { e.preventDefault(); setSensorFilter(sensorDraft); }}
          >
            <input
              className="inp mono f1"
              type="search"
              placeholder="Filter by sensor ID, then press Enter"
              aria-label="Filter by sensor ID"
              value={sensorDraft}
              onChange={(e) => { setSensorDraft(e.target.value); if (!e.target.value) setSensorFilter(""); }}
              onBlur={() => setSensorFilter(sensorDraft)}
            />
            <select className="inp" style={{ width: "auto" }} aria-label="Rows to show" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value="20">Show 20</option>
              <option value="50">Show 50</option>
              <option value="100">Show 100</option>
            </select>
          </form>

          {rows.length === 0 ? (
            <Empty title={loading ? "Loading readings…" : "No readings match"}>
              {!loading && <span>Change the filters, or send a reading with the form.</span>}
            </Empty>
          ) : (
            <div className="tb-wrap tb-tall">
              <table className="tb">
                <thead>
                  <tr><th>Timestamp</th><th>Sensor ID</th><th>Type</th><th>Value</th><th><span className="sr">Inspect</span></th></tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="sub">{new Date(m.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" })}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{m.sensor_id}</td>
                      <td><Chip tone="n">{metricType(m.metric_type).label}</Chip></td>
                      <td style={{ fontWeight: 600 }}>{metricValue(m)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="vd" onClick={() => setInspected(m)} aria-label={`Inspect reading from ${m.sensor_id}`}>Inspect</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card as="form" className="pad col send-form" onSubmit={handleIngest}>
          <Head icon={Send} title="Send a reading" />
          <TypeChips value={form.type} onChange={(type) => { clearResult(); setForm((prev) => ({ ...prev, type })); }} label="Reading type to send" />
          <Field label="Sensor ID">
            <input className="inp mono" type="text" required minLength={3} maxLength={64} value={form.sensorId} onChange={set("sensorId")} />
          </Field>
          <div className="g2" style={{ gap: "calc(5 * var(--u))" }}>
            <Field label={`Value (${unit})`}>
              <input className="inp" type="number" step="any" required value={form.value} onChange={set("value")} />
            </Field>
            {form.type === "temperature" && (
              <Field label="Unit">
                <select className="inp" value={form.unit} onChange={set("unit")}>
                  <option value="C">°C</option>
                  <option value="F">°F</option>
                  <option value="K">K</option>
                </select>
              </Field>
            )}
            {form.type === "cpu" && (
              <Field label="Core count">
                <input className="inp" type="number" min="1" value={form.coreCount} onChange={set("coreCount")} />
              </Field>
            )}
            {form.type === "cpu" && (
              <Field label="Process count">
                <input className="inp" type="number" min="0" value={form.processCount} onChange={set("processCount")} />
              </Field>
            )}
            {form.type === "network" && (
              <Field label="Bytes sent">
                <input className="inp" type="number" min="0" value={form.bytesSent} onChange={set("bytesSent")} />
              </Field>
            )}
            {form.type === "network" && (
              <Field label="Bytes received">
                <input className="inp" type="number" min="0" value={form.bytesRecv} onChange={set("bytesRecv")} />
              </Field>
            )}
          </div>
          <Field label="Start from a preset">
            <select className="inp" value="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">Choose a preset…</option>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <button type="submit" className="bk" disabled={sending}>
            <Send strokeWidth={1.9} aria-hidden="true" />
            {sending ? "Sending…" : "Send reading"}
          </button>

          {lastResponse && (
            <p className={cx("note", lastResponse.alert_triggered && "w")} role="status">
              {lastResponse.alert_triggered ? "Reading stored. It is over its limit, so an alert was raised." : "Reading stored."}
              <span className="mono cut" style={{ display: "block", fontWeight: 400 }}>{lastResponse.metric_id}</span>
            </p>
          )}
          {errorMsg && <p className="note w" role="alert">{errorMsg}</p>}

          <details>
            <summary className="sub" style={{ cursor: "pointer" }}>Payload preview</summary>
            <pre className="code" style={{ marginTop: "calc(4 * var(--u))" }}>{JSON.stringify(buildPayload(form), null, 2)}</pre>
          </details>
        </Card>
      </div>

      {inspected && (
        <Modal title={`Reading from ${inspected.sensor_id}`} onClose={() => setInspected(null)}>
          <pre className="code">{JSON.stringify(inspected, null, 2)}</pre>
        </Modal>
      )}
    </div>
  );
}
