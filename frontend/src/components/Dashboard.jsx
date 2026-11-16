import React, { useEffect, useMemo, useState } from "react";
import { Check, Flame } from "lucide-react";
import { BACKEND_DISABLED, fetchDevices, fetchLatestTelemetry, fetchTelemetryHistory } from "../services/api";
import { SAMPLE_DEVICES, SAMPLE_SNAPSHOT, SAMPLE_PLACES, sampleWave } from "./sampleData";
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
const TITLES = { cpu_util: "CPU Utilization", gpu_util: "GPU Utilization", ram_usage: "RAM Usage", disk_used: "Storage Used", cpu_power: "Package Power", gpu_vram: "VRAM Used", ram_used: "RAM Used", vrm_temp: "VRM Temperature", psu_12v: "PSU +12V Rail" };

// How much each sample series wanders (share of its value); slow readings barely move.
const SAMPLE_SWING = { psu_12v: 0.004, disk_smart: 0.003, disk_tbw: 0.01, disk_used: 0.008, cpu_clock: 0.05, ram_used: 0.05, ram_usage: 0.05, gpu_vram: 0.2 };

/** A time label for every sample point, newest last. */
function sampleLabels(period, count) {
  const now = new Date();
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

/**
 * The first device's latest snapshot and its stored history for the period.
 * In frontend-only mode it returns the sample PC, with `history` null so the
 * graphs draw sample series instead.
 */
function useTelemetry(period) {
  const [state, setState] = useState(() => (
    BACKEND_DISABLED
      ? { status: "ready", device: SAMPLE_DEVICES[0], snapshot: SAMPLE_SNAPSHOT, history: null }
      : { status: "loading" }
  ));

  useEffect(() => {
    if (BACKEND_DISABLED) return undefined;
    let cancelled = false;
    const span = PERIODS.find((p) => p.id === period).ms;
    const load = async () => {
      try {
        const device = (await fetchDevices())?.devices?.[0];
        if (!device) {
          if (!cancelled) setState({ status: "empty" });
          return;
        }
        const [snapshot, stored] = await Promise.all([
          fetchLatestTelemetry(device.id).catch(() => null),
          fetchTelemetryHistory(device.id, { start: new Date(Date.now() - span) }).catch(() => null),
        ]);
        if (cancelled) return;
        // The API returns the newest first; the graphs want oldest first.
        setState({ status: snapshot ? "ready" : "empty", device, snapshot, history: [...(stored?.snapshots || [])].reverse() });
      } catch (error) {
        if (!cancelled) setState({ status: "error", error });
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [period]);

  return state;
}

/** A reading's values over the period, with a time label for each point. */
function buildSeries(reading, { snapshot, history }, period) {
  const none = { values: [], labels: [] };
  if (!isCharted(reading)) return none;

  if (!history) {
    const end = valueOf(reading, snapshot);
    if (end === null) return none;
    const points = PERIODS.find((p) => p.id === period).points;
    const seed = ([...reading.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 9) + points * 0.1;
    return {
      values: sampleWave(points, end, { seed, swing: SAMPLE_SWING[reading.id], min: reading.min ?? 0, max: maxOf(reading, snapshot), digits: Math.max(1, reading.digits || 0) }),
      labels: sampleLabels(period, points),
    };
  }

  if (!history.length) return none;
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
  const series = buildSeries(reading, data, period);
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

// -------------------------------------------------------------- the view

export function Dashboard({ onNavigate }) {
  const [tab, setTab] = useState("cpu");
  const [period, setPeriod] = useState("24h");
  const [detail, setDetail] = useState(null);
  const data = useTelemetry(period);

  const group = GROUPS.find((g) => g.id === tab);
  const byId = useMemo(() => Object.fromEntries(group.readings.map((r) => [r.id, r])), [group]);

  if (data.status !== "ready") {
    return (
      <div className="page">
        <Card className="pad f1 col">
          {data.status === "loading" && <Empty title="Loading your readings…" />}
          {data.status === "error" && <Empty title="Couldn't load your readings">{data.error?.message}</Empty>}
          {data.status === "empty" && (
            <Empty title={data.device ? `No readings from ${data.device.device_name} yet` : "Connect your first PC"}>
              <span>Run the Lectio agent on the computer you want to watch and its readings appear here.</span>
              <button type="button" className="bk" onClick={() => onNavigate?.("devices")}>Open My Devices</button>
            </Empty>
          )}
        </Card>
      </div>
    );
  }

  const { snapshot, device } = data;
  const read = (reading) => {
    const value = valueOf(reading, snapshot);
    return { value, shown: display(reading, value), status: statusOf(reading, value), stats: summarise(buildSeries(reading, data, period).values) };
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

  const gauge = byId[group.layout.gauge];
  const gaugeNow = read(gauge);
  const drive = snapshot.storage?.[0];
  const gaugeFoot = gauge.id === "disk_used" && drive
    ? <>Free space <b>{Math.round(drive.available_capacity_gb ?? 0).toLocaleString("en-US")} GB</b> of {Math.round(drive.total_capacity_gb).toLocaleString("en-US")} GB</>
    : gauge.id === "ram_usage" && snapshot.ram?.total_gb
      ? <><b>{show(byId.ram_used, snapshot.ram.used_gb)}</b> of {Math.round(snapshot.ram.total_gb)} GB in use</>
      : gaugeNow.stats
        ? <>Average over {period} <b>{show(gauge, gaugeNow.stats.avg)}</b></>
        : gaugeNow.status.text;

  const big = group.layout.big ? byId[group.layout.big] : null;
  const bigNow = big ? read(big) : null;

  // Where the PCs are. The API has no location for a device yet, so with the
  // backend connected a device only appears once it carries a `country`.
  const places = BACKEND_DISABLED
    ? SAMPLE_PLACES
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
      <div className="row ac wrap">
        <Tabs
          label="Component"
          value={tab}
          onChange={setTab}
          items={GROUPS.map((g) => ({ id: g.id, label: g.label, icon: g.icon, count: g.readings.length }))}
        />
        <span className="sub r">
          {device.device_name}
          {tab === "storage" && drive?.device_name ? ` · ${drive.device_name}` : ""}
          {` · updated ${timeAgo(snapshot.timestamp)}`}
        </span>
        {BACKEND_DISABLED && <Chip tone="o">Sample data</Chip>}
      </div>

      {group.layout.stats.length > 0 && <div className="g3">{group.layout.stats.map(statCard)}</div>}

      <div className={`gmid${big ? "" : " two"}`}>
        <article className="card r2 gs">
          <h3>{TITLES[gauge.id] || gauge.label}</h3>
          <div className="big">{gaugeNow.shown.text}<small>{gaugeNow.shown.unit}</small></div>
          <Gauge share={scale(gauge, gaugeNow.value)} warn={gaugeNow.status.warn} />
          <div className="foot">{gaugeFoot}</div>
          <button type="button" className="btn" onClick={() => setDetail(gauge.id)} aria-label={`View details: ${gauge.label}`}>View Details</button>
        </article>

        {big && (
          <article className="card r2 dk">
            <h3>{TITLES[big.id] || big.label}</h3>
            <div className="big">{bigNow.shown.text}<small> {bigNow.shown.unit}</small></div>
            <div className="rows">
              <div><i aria-hidden="true" />Low<em>{bigNow.stats ? show(big, bigNow.stats.low) : "—"}</em></div>
              <div><i aria-hidden="true" />Average<em>{bigNow.stats ? show(big, bigNow.stats.avg) : "—"}</em></div>
              <div><i aria-hidden="true" />High<em>{bigNow.stats ? show(big, bigNow.stats.high) : "—"}</em></div>
            </div>
            <button type="button" className="btn" onClick={() => setDetail(big.id)} aria-label={`View details: ${big.label}`}>View Details</button>
          </article>
        )}

        <DeviceMap
          places={places}
          sample={BACKEND_DISABLED}
          emptyText="Lectio doesn't record where your PCs are yet, so there is nothing to shade on the map."
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
    </div>
  );
}
