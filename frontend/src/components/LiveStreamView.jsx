import React, { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { useDeviceStream } from "../hooks/useDeviceStream";
import { GROUPS, valueOf, maxOf, statusOf, show } from "./readings";
import { Card, Head, Chip, LineGraph, Modal } from "./ui";
import { DeviceBar, StreamStatus } from "./live";

// Live Monitor: the PC's key readings as live graphs, filled by each snapshot
// the agent sends (every 2 seconds), and the PC's open alerts underneath.

// The readings worth watching live, most important first. The page graphs the
// first six this PC actually reports.
const PRIORITY = [
  "cpu_util", "cpu_core_temp", "ram_usage", "gpu_util", "gpu_core_temp", "vrm_temp",
  "cpu_package_temp", "gpu_hotspot", "disk_used", "psu_12v", "cpu_clock", "ram_pagefile", "cpu_power", "gpu_power",
];
const SHOWN = 6;
const BY_ID = Object.fromEntries(GROUPS.flatMap((g) => g.readings.map((r) => [r.id, { ...r, group: g }])));

export function LiveStreamView({ onNavigate }) {
  const stream = useDeviceStream();
  const { snapshot, history, alerts, connection } = stream;
  const [openId, setOpenId] = useState(null);

  const watched = useMemo(() => {
    const reported = PRIORITY.filter((id) => valueOf(BY_ID[id], snapshot) !== null);
    return (reported.length ? reported : PRIORITY).slice(0, SHOWN).map((id) => BY_ID[id]);
  }, [snapshot]);

  const status = StreamStatus({ stream, onNavigate });
  if (status) return <div className="page">{status}</div>;

  const live = connection === "live";
  const labels = history.map((s) => new Date(s.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }));
  const seriesOf = (reading) => {
    const values = history.map((s) => valueOf(reading, s));
    return { values, breaches: values.filter((v) => statusOf(reading, v).warn).length };
  };

  const open = openId ? BY_ID[openId] : null;
  const openSeries = open ? seriesOf(open) : null;

  return (
    <div className="page">
      <DeviceBar stream={stream}>
        <span className="sub">
          {history.length} recent readings · <b style={{ color: alerts.length ? "var(--rose-line)" : "#fff" }}>{alerts.length}</b> open alerts
        </span>
      </DeviceBar>

      <div className="g3">
        {watched.map((reading) => {
          const value = valueOf(reading, snapshot);
          const state = statusOf(reading, value);
          const { values, breaches } = seriesOf(reading);
          const Icon = reading.icon;
          return (
            <Card key={reading.id} className="pad col" style={{ gap: "calc(4 * var(--u))" }}>
              <Head icon={Icon} title={`${reading.group.label} · ${reading.label}`}>
                {live && <Chip>Live</Chip>}
              </Head>
              <div className="val" style={{ marginTop: 0 }}>
                {show(reading, value)}
                {state.warn && <Chip tone="w">{state.text}</Chip>}
              </div>
              <div className="chart live-plot">
                <LineGraph
                  bare
                  series={[{ name: reading.label, colour: "#1c7a2e", values }]}
                  labels={labels}
                  min={reading.min ?? 0}
                  max={maxOf(reading, snapshot)}
                  unit={(reading.unit || "").trim()}
                  digits={reading.digits || 0}
                  limit={reading.warnAt}
                  emptyText={value === null ? "Not reported by this PC" : "Waiting for readings"}
                  summary={`${reading.group.label} ${reading.label} as readings arrive`}
                />
              </div>
              <div className="row ac">
                <span className="sub">{values.filter((v) => v !== null).length} readings · {breaches} over the limit</span>
                <button type="button" className="vd r" onClick={() => setOpenId(reading.id)} aria-label={`View details: ${reading.group.label} ${reading.label}`}>View details</button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="pad col f1">
        <Head icon={Bell} title="Alerts">
          {alerts.length > 0 && <Chip tone="w">{alerts.length} open</Chip>}
        </Head>
        <div className="row ac wrap">
          <p className="txt f1">
            {alerts.length
              ? `${alerts.length === 1 ? "1 problem needs" : `${alerts.length} problems need`} a look. See what's wrong and how to fix it in the alerts window.`
              : "No open alerts. Every reading is within its limit."}
          </p>
          {alerts.length > 0 && <button type="button" className="bk" onClick={() => onNavigate?.("alerts")}>See and fix</button>}
        </div>
      </Card>

      {open && (
        <Modal title={`${open.group.label} · ${open.label} · live`} onClose={() => setOpenId(null)}>
          <dl className="st">
            <div><dt>Now</dt><dd>{show(open, valueOf(open, snapshot))}</dd></div>
            <div><dt>Limit</dt><dd>{open.warnAt !== undefined ? show(open, open.warnAt) : "—"}</dd></div>
            <div><dt>Readings</dt><dd>{openSeries.values.filter((v) => v !== null).length}</dd></div>
            <div><dt>Over the limit</dt><dd>{openSeries.breaches}</dd></div>
          </dl>
          <div className="chart" style={{ padding: 0, minHeight: "calc(120 * var(--u))" }}>
            <LineGraph
              series={[{ name: open.label, colour: "#1c7a2e", values: openSeries.values }]}
              labels={labels}
              min={open.min ?? 0}
              max={maxOf(open, snapshot)}
              unit={(open.unit || "").trim()}
              digits={open.digits || 0}
              limit={open.warnAt}
              emptyText="Waiting for readings"
              summary={`${open.label} as readings arrive`}
            />
          </div>
          <p className="txt">{open.hint} The last {history.length} readings from the last two minutes.</p>
        </Modal>
      )}
    </div>
  );
}
