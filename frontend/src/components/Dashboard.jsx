import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Flame, HeartPulse, ListTree, ShieldCheck, WifiOff } from "lucide-react";
import {
  fetchDeviceAlerts,
  fetchDevices,
  fetchLatestTelemetry,
  fetchTelemetryHistory,
  refreshAccessToken,
  telemetrySocketUrl,
} from "../services/api";
import { HealthSummary } from "./HealthSummary";
import { SecurityCard } from "./SecurityCard";
import { DailyReportCard } from "./DailyReportCard";
import { AddDevice } from "./DevicesView";
import { GROUPS, READING_COUNT, valueOf, maxOf, statusOf, display, show, isCharted, healthOf } from "./readings";
import { Card, Chip, Stat, Pill, Ring, Gauge, Tabs, Seg, LineGraph, Modal, Promo, Empty } from "./ui";
import { DeviceMap } from "./DeviceMap";
import { timeAgo } from "./format";

// The dashboard: one screen, a tab per component. Each tab lays its readings
// out in the same slots (stat cards, a gauge, a big number and two pills), as
// listed under `layout` in readings.js, beside the map of where the PCs are.
// Every card has a "View details" button that opens the reading's history.

const HOUR = 3600 * 1000;
const PERIODS = [
  { id: "24h", label: "24h", ms: 24 * HOUR, points: 24 },
  { id: "7d", label: "7d", ms: 7 * 24 * HOUR, points: 7 },
  { id: "30d", label: "30d", ms: 30 * 24 * HOUR, points: 30 },
];

// Headings for the two tall cards.
const TITLES = { cpu_util: "How busy the processor is", gpu_util: "How busy the graphics card is", ram_usage: "Memory in use", disk_used: "Drive space used", cpu_power: "Processor power use", gpu_vram: "Graphics memory used", ram_used: "Memory used", vrm_temp: "Power parts temperature", psu_12v: "Power supply voltage" };

// Live snapshots kept in memory for the graphs (about 100 minutes at one every 2 s).
const LIVE_KEEP = 3000;

// Stored snapshots fetched for a period's graphs, spread evenly across it.
// The graphs average them into at most 30 points; two per point keeps the
// download small (each snapshot is about 2 KB) on a slow connection.
const HISTORY_POINTS = 60;

/** Merge alerts from the live connection: update known ones, add new ones, drop closed ones. */
function mergeAlerts(prev, incoming) {
  if (!incoming?.length) return prev;
  const byId = new Map(incoming.map((a) => [a.id, a]));
  const kept = prev.map((a) => (byId.has(a.id) ? { ...a, ...byId.get(a.id) } : a));
  const added = incoming.filter((a) => !prev.some((p) => p.id === a.id));
  return [...added, ...kept].filter((a) => a.is_active !== false).slice(0, 50);
}

/**
 * The first device's latest snapshot and its stored history for the period,
 * then every new snapshot as the agent sends it (about every 2 seconds) over
 * the device's live connection, like Task Manager's refresh. `onAlerts`
 * receives the alerts that come with each snapshot.
 */
function useTelemetry(period, onAlerts) {
  const [state, setState] = useState({ status: "loading", live: false });
  const onAlertsRef = useRef(onAlerts);
  onAlertsRef.current = onAlerts;
  // "Try again" and the browser's "online" event: fetch now and reconnect
  // without waiting for the next scheduled attempt.
  const reloadRef = useRef(() => {});
  const reconnectRef = useRef(() => {});

  useEffect(() => {
    let cancelled = false;
    const span = PERIODS.find((p) => p.id === period).ms;
    const load = async (withHistory) => {
      try {
        const device = (await fetchDevices())?.devices?.[0];
        if (!device) {
          if (!cancelled) setState({ status: "empty" });
          return;
        }
        // Show the latest reading as soon as it arrives; the history for the
        // graphs and averages can take longer and fills in afterwards. The
        // graphs average it into at most 30 points, so a few hundred snapshots
        // spread over the period are plenty.
        const historyRequest = withHistory
          ? fetchTelemetryHistory(device.id, { start: new Date(Date.now() - span), points: HISTORY_POINTS }).catch(() => null)
          : Promise.resolve(null);
        const snapshot = await fetchLatestTelemetry(device.id).catch(() => null);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          status: snapshot || prev.snapshot ? "ready" : "empty",
          device,
          // A live snapshot may already be newer than the stored one.
          snapshot: prev.snapshot && snapshot && new Date(prev.snapshot.timestamp) > new Date(snapshot.timestamp) ? prev.snapshot : snapshot || prev.snapshot,
        }));
        const stored = await historyRequest;
        if (cancelled || !stored) return;
        // The API returns the newest first; the graphs want oldest first. Live
        // snapshots that arrived meanwhile stay on the end.
        setState((prev) => {
          const older = [...(stored.snapshots || [])].reverse();
          const newest = older.length ? new Date(older[older.length - 1].timestamp).getTime() : 0;
          const live = (prev.history || []).filter((h) => new Date(h.timestamp).getTime() > newest);
          return { ...prev, history: [...older, ...live] };
        });
      } catch (error) {
        // Offline after the first load: keep showing the last readings.
        if (!cancelled) setState((prev) => (prev.snapshot ? prev : { status: "error", error }));
      }
    };
    reloadRef.current = () => load(true);  // the history may have failed too
    load(true);
    // A safety net only: live updates arrive over the socket below and are
    // added to the history, so the history isn't downloaded again each time.
    const timer = setInterval(() => load(false), 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [period]);

  // Live connection to the device: each message is a full snapshot.
  const deviceId = state.device?.id;
  useEffect(() => {
    if (!deviceId) return undefined;
    const span = PERIODS.find((p) => p.id === period).ms;
    let ws;
    let retry;
    let disposed = false;
    let attempts = 0;
    const connect = async () => {
      if (disposed) return;
      const url = await telemetrySocketUrl(deviceId);
      if (disposed) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempts = 0;
        setState((prev) => ({ ...prev, live: true }));
      };
      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === "telemetry" && data.telemetry) {
          const snap = { ...data.telemetry, timestamp: data.timestamp || data.telemetry.timestamp };
          const cutoff = Date.now() - span;
          setState((prev) => ({
            ...prev,
            status: "ready",
            snapshot: snap,
            history: [...(prev.history || []).filter((h) => new Date(h.timestamp).getTime() >= cutoff), snap].slice(-LIVE_KEEP),
          }));
        }
        if (Array.isArray(data.alerts) && data.alerts.length) onAlertsRef.current?.(data.alerts);
      };
      ws.onclose = async (event) => {
        if (disposed) return;
        setState((prev) => ({ ...prev, live: false }));
        if (event.code === 1008) await refreshAccessToken();  // expired sign-in
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++));
      };
    };
    reconnectRef.current = () => {
      if (disposed || ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
      clearTimeout(retry);
      attempts = 0;
      connect().catch(() => {});
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      reconnectRef.current = () => {};
      ws?.close();
    };
  }, [deviceId, period]);

  // A new PC (or one that hasn't sent a reading yet): check every 10 s, so it
  // shows up soon after the agent starts instead of after a minute.
  const waiting = state.status === "empty";
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => reloadRef.current(), 10000);
    return () => clearInterval(timer);
  }, [waiting]);

  const retryNow = useCallback(() => {
    reloadRef.current();
    reconnectRef.current();
  }, []);

  return { ...state, retryNow };
}

// How long the live connection may be down before the dashboard says so; a
// short drop reconnects on its own and isn't worth a notice.
const OFFLINE_AFTER_MS = 8000;

/**
 * True when live monitoring is off because of the connection: the browser
 * reports no network, or the live connection has been down a while (Wi-Fi
 * with no internet still counts as "online" to the browser).
 */
function useOffline(live, retryNow) {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const on = () => { setOnline(true); retryNow(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [retryNow]);

  useEffect(() => {
    if (live) {
      setStalled(false);
      return undefined;
    }
    const timer = setTimeout(() => setStalled(true), OFFLINE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [live]);

  return !online || stalled;
}

/** Option C: a dark notice in the corner asking for an internet connection. */
function OfflineNotice({ onRetry }) {
  const [trying, setTrying] = useState(false);
  useEffect(() => {
    if (!trying) return undefined;
    const timer = setTimeout(() => setTrying(false), 3000);
    return () => clearTimeout(timer);
  }, [trying]);
  return (
    <div className="net-off" role="status">
      <WifiOff strokeWidth={2} aria-hidden="true" />
      <span>No internet. Connect for live monitoring.</span>
      <button type="button" onClick={() => { setTrying(true); onRetry(); }} disabled={trying}>
        {trying ? "Trying…" : "Try again"}
      </button>
    </div>
  );
}

/** A reading's values over the period, with a time label for each point. */
function buildSeries(reading, { history }) {
  const none = { values: [], labels: [] };
  if (!isCharted(reading)) return none;

  if (!history?.length) return none;
  // Average the stored snapshots into at most 30 buckets across the time they cover.
  const at = (snap) => new Date(snap.timestamp).getTime();
  const first = at(history[0]);
  const last = at(history[history.length - 1]);
  const buckets = Math.min(30, history.length);
  const width = (last - first) / buckets || 1;
  const sums = Array(buckets).fill(0);
  const counts = Array(buckets).fill(0);
  history.forEach((snap) => {
    const v = valueOf(reading, snap);
    if (v === null) return;
    const i = Math.min(buckets - 1, Math.floor((at(snap) - first) / width));
    sums[i] += Number(v);
    counts[i] += 1;
  });
  const days = last - first > 36 * HOUR;
  return {
    values: sums.map((sum, i) => (counts[i] ? sum / counts[i] : null)),
    labels: sums.map((_, i) => {
      const d = new Date(first + (i + 0.5) * width);
      return days
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }),
  };
}

function summarise(values) {
  const nums = values.filter((v) => v !== null && v !== undefined);
  if (!nums.length) return null;
  return { nums, low: Math.min(...nums), high: Math.max(...nums), avg: nums.reduce((s, v) => s + v, 0) / nums.length };
}

function limitSentence(reading) {
  const { warnAt, warnBelow } = reading;
  if (warnAt !== undefined && warnBelow !== undefined) return ` Lectio warns you below ${show(reading, warnBelow)} or above ${show(reading, warnAt)}.`;
  if (warnAt !== undefined) return ` Lectio warns you at ${show(reading, warnAt)} or above.`;
  if (warnBelow !== undefined) return ` Lectio warns you at ${show(reading, warnBelow)} or below.`;
  return "";
}

// ------------------------------------------------------------ the dialog

function ReadingDetail({ group, reading, data, period, setPeriod, onClose, onNavigate }) {
  const value = valueOf(reading, data.snapshot);
  const shown = display(reading, value);
  const status = statusOf(reading, value);
  const series = buildSeries(reading, data);
  const stats = summarise(series.values);
  return (
    <Modal title={`${group.label} · ${reading.label}`} onClose={onClose}>
      <div className="row ac wrap">
        <div className="val" style={{ margin: 0, fontSize: "calc(20 * var(--u))" }}>{shown.text}{shown.unit && <small> {shown.unit}</small>}</div>
        <Chip tone={status.warn ? "w" : undefined}>{status.text}</Chip>
        {isCharted(reading) && <Seg items={PERIODS} value={period} onChange={setPeriod} label="Period" />}
      </div>
      <p className="txt">{reading.hint}{limitSentence(reading)}</p>
      {isCharted(reading) && (
        <>
          {stats && (
            <dl className="st">
              <div><dt>Low</dt><dd>{show(reading, stats.low)}</dd></div>
              <div><dt>Average</dt><dd>{show(reading, stats.avg)}</dd></div>
              <div><dt>High</dt><dd>{show(reading, stats.high)}</dd></div>
              <div><dt>Now</dt><dd>{show(reading, value)}</dd></div>
            </dl>
          )}
          <div className="chart" style={{ padding: 0, minHeight: "calc(110 * var(--u))" }}>
            <LineGraph
              series={[{ name: reading.label, colour: "#1c7a2e", values: series.values }]}
              labels={series.labels}
              min={reading.min ?? 0}
              max={maxOf(reading, data.snapshot)}
              unit={reading.unit || ""}
              digits={reading.digits || 0}
              limit={reading.warnAt}
              summary={`${group.label} ${reading.label} over the last ${period}`}
            />
          </div>
        </>
      )}
      <div className="row">
        <button type="button" className="bk" onClick={() => { onClose(); onNavigate?.("devices"); }}>Open My Devices</button>
        <button type="button" className="bk ol" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------- top processes

const fmtMb = (mb) => (mb === null || mb === undefined ? "—" : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const fmtRate = (bytes) => (bytes === null || bytes === undefined ? "—" : `${(bytes / 1e6).toFixed(1)} MB/s`);

/** Task Manager's Processes tab in the gauge and big-card slots. */
function TopProcesses({ processes }) {
  const rows = processes || [];
  return (
    <article className="card r2 dk proc-card">
      <h3><ListTree strokeWidth={1.9} aria-hidden="true" /> Top programs right now</h3>
      {rows.length === 0 ? (
        <p className="foot">This PC hasn&apos;t sent its process list yet. It arrives with the next reading from an up-to-date agent.</p>
      ) : (
        <table className="proc-table">
          <thead>
            <tr><th scope="col">Name</th><th scope="col">CPU</th><th scope="col">Memory</th><th scope="col">Disk</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((p) => (
              <tr key={`${p.pid}-${p.name}`}>
                <td className="cut" title={`${p.name} (PID ${p.pid})`}>{p.name}</td>
                <td>{p.cpu_percent.toFixed(1)}%</td>
                <td>{fmtMb(p.memory_mb)}</td>
                <td>{fmtRate(p.disk_bytes_per_s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

// -------------------------------------------------------------- the view

export function Dashboard({ onNavigate, tab: tabProp, onTabChange }) {
  // The tab can be chosen from outside (the alert pop-up opens "Alerts").
  const [ownTab, setOwnTab] = useState("summary");
  const tab = tabProp ?? ownTab;
  const setTab = onTabChange ?? setOwnTab;
  const [period, setPeriod] = useState("24h");
  const [detail, setDetail] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const data = useTelemetry(period, (incoming) => setAlerts((prev) => mergeAlerts(prev, incoming)));
  // With no PC set up there's no live connection to miss.
  const offline = useOffline(data.live || data.status === "empty", data.retryNow);
  const notice = offline && <OfflineNotice onRetry={data.retryNow} />;

  // Open alerts for the device; the live connection keeps them current.
  const deviceId = data.device?.id;
  useEffect(() => {
    if (!deviceId) return undefined;
    let cancelled = false;
    fetchDeviceAlerts(deviceId, { activeOnly: true })
      .then((res) => { if (!cancelled) setAlerts(res?.alerts || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [deviceId]);

  const group = GROUPS.find((g) => g.id === tab) || null;
  const byId = useMemo(() => Object.fromEntries((group?.readings || []).map((r) => [r.id, r])), [group]);

  if (data.status === "empty" && !data.device) {
    return (
      <div className="page">
        <h2 className="hs-welcome">Welcome to Lectio. Connect your first PC to see how it&apos;s doing.</h2>
        <AddDevice onRefresh={data.retryNow} waiting />
        {notice}
      </div>
    );
  }

  if (data.status !== "ready") {
    return (
      <div className="page">
        <Card className="pad f1 col">
          {data.status === "loading" && <Empty title="Loading your readings…" />}
          {data.status === "error" && <Empty title="Couldn't load your readings">{data.error?.message}</Empty>}
          {data.status === "empty" && data.device && (
            <Empty title={`${data.device.device_name} is connected`}>
              <span className="wait-line" role="status">
                <span className="wait-dot" aria-hidden="true" /> Waiting for its first reading. This usually takes under a minute.
              </span>
            </Empty>
          )}
        </Card>
        {notice}
      </div>
    );
  }

  const { snapshot, device, live } = data;

  const status = (
    <span className="sub r">
      {live && <span className="live-dot">Live</span>}
      {device.device_name}
      {tab === "storage" && snapshot.storage?.[0]?.device_name ? ` · ${snapshot.storage[0].device_name}` : ""}
      {` · updated ${timeAgo(snapshot.timestamp)}`}
    </span>
  );

  // The first view: four plain questions; the tabs are the advanced details.
  // (An old "alerts" tab, or any unknown one, lands here too.)
  // The live reading carries the security report; until the first one
  // arrives, the device's latest stored report stands in.
  const security = snapshot.security || device.security || null;

  if (tab === "summary" || (!group && tab !== "security")) {
    return (
      <div className="page">
        <div className="row ac wrap">{status}</div>
        <HealthSummary snapshot={snapshot} security={security} alerts={alerts} onOpenTab={setTab} onOpenAlerts={() => onNavigate?.("alerts")} />
        <DailyReportCard device={device} />
        {notice}
      </div>
    );
  }

  const tabs = (
    <div className="row ac wrap">
      <Tabs
        label="Component"
        value={tab}
        onChange={setTab}
        items={[
          { id: "summary", label: "Summary", icon: HeartPulse },
          ...GROUPS.map((g) => ({ id: g.id, label: g.label, icon: g.icon })),
          { id: "security", label: "Security", icon: ShieldCheck },
        ]}
      />
      {status}
    </div>
  );

  if (tab === "security") {
    return (
      <div className="page">
        {tabs}
        <SecurityCard security={security} device={device} onOpenAlerts={() => onNavigate?.("alerts")} />
        {notice}
      </div>
    );
  }

  const read = (reading) => {
    const value = valueOf(reading, snapshot);
    return { value, shown: display(reading, value), status: statusOf(reading, value), stats: summarise(buildSeries(reading, data).values) };
  };
  const scale = (reading, value) => {
    const min = reading.min ?? 0;
    return value === null ? 0 : (value - min) / (maxOf(reading, snapshot) - min || 1);
  };

  // Card fills alternate: brand green, black, then white.
  const STAT_TONES = ["gd", "dk", undefined];
  const statCard = (id, index) => {
    const reading = byId[id];
    const { value, shown, status, stats } = read(reading);
    const change = stats && stats.avg ? ((value - stats.avg) / stats.avg) * 100 : null;
    return (
      <Stat
        key={id}
        label={`${group.label} · ${reading.label}`}
        value={shown.text}
        unit={shown.unit}
        warn={status.warn}
        tone={STAT_TONES[index % STAT_TONES.length]}
        icon={reading.icon || group.icon}
        sub={change === null ? status.text : <><b>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%</b> vs {period} average</>}
        onAction={() => setDetail(id)}
      />
    );
  };

  const gauge = group.layout.gauge ? byId[group.layout.gauge] : null;
  const gaugeNow = gauge ? read(gauge) : null;
  const drive = snapshot.storage?.[0];
  const gaugeFoot = !gauge ? null : gauge.id === "disk_used" && drive
    ? <>Free space <b>{Math.round(drive.available_capacity_gb ?? 0).toLocaleString("en-US")} GB</b> of {Math.round(drive.total_capacity_gb).toLocaleString("en-US")} GB</>
    : gauge.id === "ram_usage" && snapshot.ram?.total_gb
      ? <><b>{show(byId.ram_used, snapshot.ram.used_gb)}</b> of {Math.round(snapshot.ram.total_gb)} GB in use</>
      : gaugeNow.stats
        ? <>Average over {period} <b>{show(gauge, gaugeNow.stats.avg)}</b></>
        : gaugeNow.status.text;

  const big = group.layout.big ? byId[group.layout.big] : null;
  const bigNow = big ? read(big) : null;

  // Where the PCs are, when the owner switched location on: exactly (Windows
  // Location) or roughly (from its internet address); otherwise its country
  // (set on My Devices).
  const spot = device.location_enabled && ["ok", "approximate"].includes(device.location?.status) ? device.location : null;
  const places = spot
    ? [{
      key: device.id, label: device.device_name, country: device.country || spot.country || null,
      lngLat: [spot.longitude, spot.latitude], accuracy: spot.accuracy_m,
      approximate: spot.status === "approximate", area: spot.city || spot.country, health: healthOf(snapshot),
    }]
    : device.country ? [{ country: device.country, health: healthOf(snapshot) }] : [];

  const pill = (id, tone) => {
    const reading = byId[id];
    const { value, shown, status } = read(reading);
    const Icon = group.icon;
    const centre = reading.kind === "text"
      ? <Icon strokeWidth={1.9} />
      : reading.kind === "flag"
        ? (value ? <Flame strokeWidth={1.9} /> : <Check strokeWidth={2.2} />)
        : `${shown.text}${shown.unit === "%" ? "%" : shown.unit === "°C" ? "°" : ""}`;
    return (
      <Pill
        key={id}
        tone={tone}
        title={reading.label}
        sub={reading.kind === "text" ? shown.text : reading.kind === "flag" ? `${shown.text} · ${status.text}` : `${show(reading, value)} · ${reading.hint}`}
        ring={<Ring tone={tone} warn={status.warn} share={isCharted(reading) ? scale(reading, value) : 1}>{centre}</Ring>}
      >
        <button type="button" className="vd" onClick={() => setDetail(id)} aria-label={`View details: ${reading.label}`}>View details</button>
      </Pill>
    );
  };

  return (
    <div className="page">
      {tabs}

      {group.layout.stats.length > 0 && <div className="g3">{group.layout.stats.map(statCard)}</div>}

      <div className={`gmid${big || group.layout.list ? "" : " two"}`}>
        {group.layout.list === "processes" && <TopProcesses processes={snapshot.processes} />}

        {gauge && (
          <article className="card r2 gs">
            <h3>{TITLES[gauge.id] || gauge.label}</h3>
            <div className="big">{gaugeNow.shown.text}<small>{gaugeNow.shown.unit}</small></div>
            <Gauge share={scale(gauge, gaugeNow.value)} warn={gaugeNow.status.warn} />
            <div className="foot">{gaugeFoot}</div>
            <button type="button" className="btn" onClick={() => setDetail(gauge.id)} aria-label={`View details: ${gauge.label}`}>View details</button>
          </article>
        )}

        {big && (
          <article className="card r2 dk">
            <h3>{TITLES[big.id] || big.label}</h3>
            <div className="big">{bigNow.shown.text}<small> {bigNow.shown.unit}</small></div>
            <div className="rows">
              <div><i aria-hidden="true" />Low<em>{bigNow.stats ? show(big, bigNow.stats.low) : "—"}</em></div>
              <div><i aria-hidden="true" />Average<em>{bigNow.stats ? show(big, bigNow.stats.avg) : "—"}</em></div>
              <div><i aria-hidden="true" />High<em>{bigNow.stats ? show(big, bigNow.stats.high) : "—"}</em></div>
            </div>
            <button type="button" className="btn" onClick={() => setDetail(big.id)} aria-label={`View details: ${big.label}`}>View details</button>
          </article>
        )}

        <DeviceMap
          places={places}
          emptyText="On My Devices, switch on your PC's exact location, or set its country, to place it on the map."
          onOpen={() => onNavigate?.("devices")}
        />
      </div>

      <div className="glow">
        <div className="pills">{group.layout.pills.map((id, i) => pill(id, i ? "soft" : "dark"))}</div>
        <Promo onOpen={() => onNavigate?.("devices")} note={`${READING_COUNT} readings watched`} />
      </div>

      {detail && byId[detail] && (
        <ReadingDetail
          group={group}
          reading={byId[detail]}
          data={data}
          period={period}
          setPeriod={setPeriod}
          onClose={() => setDetail(null)}
          onNavigate={onNavigate}
        />
      )}
      {notice}
    </div>
  );
}
