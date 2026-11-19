import React, { useMemo, useState } from "react";
import { Server, TriangleAlert, Clock } from "lucide-react";
import { useDeviceStream } from "../hooks/useDeviceStream";
import { GROUPS, valueOf, maxOf, statusOf, show, isCharted } from "./readings";
import { Card, Chip, Ico, Stat, Empty, LineGraph, Modal } from "./ui";
import { DeviceBar, StreamStatus, Sparkline } from "./live";
import { cx, timeAgo } from "./format";

// Sensors: a card for every sensor the agent on this PC reports (readings it
// can't read are left out), each with its live value and status, filterable
// by component. "View details" opens the last two minutes as a graph.

const ALL = { id: "all", label: "All" };

export function SensorsView({ onNavigate }) {
  const stream = useDeviceStream();
  const { snapshot, history } = stream;
  const [groupId, setGroupId] = useState("all");
  const [openId, setOpenId] = useState(null);

  const sensors = useMemo(
    () => GROUPS.flatMap((g) => g.readings.map((r) => ({ ...r, group: g }))).filter((r) => valueOf(r, snapshot) !== null),
    [snapshot],
  );

  const status = StreamStatus({ stream, onNavigate });
  if (status) return <div className="page">{status}</div>;

  const shown = groupId === "all" ? sensors : sensors.filter((s) => s.group.id === groupId);
  const warnings = sensors.filter((s) => statusOf(s, valueOf(s, snapshot)).warn);
  const groupsWithSensors = GROUPS.filter((g) => sensors.some((s) => s.group.id === g.id));
  const open = openId ? sensors.find((s) => s.id === openId) : null;

  return (
    <div className="page">
      <DeviceBar stream={stream} />

      <div className="g3">
        <Stat label="Sensors reporting" value={sensors.length} sub={<>Across <b>{groupsWithSensors.length}</b> components</>} icon={Server} tone="gd" />
        <Stat
          label="Over their limit"
          value={warnings.length}
          sub={warnings.length ? <b>{warnings.map((s) => `${s.group.label} · ${s.label}`).join(", ")}</b> : "All within their limits"}
          icon={TriangleAlert}
          tone="dk"
          warn={warnings.length > 0}
        />
        <Stat
          label="Latest reading"
          value={snapshot ? timeAgo(snapshot.timestamp).replace(" ago", "") : "—"}
          unit={snapshot ? "ago" : ""}
          sub={snapshot ? <>From <b>{stream.device?.device_name}</b></> : "Nothing received yet"}
          icon={Clock}
        />
      </div>

      {sensors.length > 0 && (
        <span className="row" role="group" aria-label="Component" style={{ gap: "calc(3 * var(--u))", flexWrap: "wrap" }}>
          {[ALL, ...groupsWithSensors].map((g) => (
            <button key={g.id} type="button" className={cx("chip", g.id === groupId ? "k" : "o")} aria-pressed={g.id === groupId} onClick={() => setGroupId(g.id)}>
              {g.label}
            </button>
          ))}
        </span>
      )}

      {sensors.length === 0 ? (
        <Card className="pad col f1">
          <Empty title={snapshot ? "This PC hasn't reported any sensors" : "Waiting for the first reading"}>
            <span>Sensors appear here as soon as the agent on {stream.device?.device_name || "your PC"} sends a reading.</span>
          </Empty>
        </Card>
      ) : (
        <div className="g3">
          {shown.map((s) => {
            const value = valueOf(s, snapshot);
            const state = statusOf(s, value);
            return (
              <Card key={s.id} className={cx("pad", state.warn && "warn-card")}>
                <div className="row ac" style={{ gap: "calc(6 * var(--u))" }}>
                  <Ico icon={s.icon} tone={state.warn ? "w" : "k"} />
                  <span className="f1 cut" style={{ fontWeight: 600 }} title={`${s.group.label} ${s.label}`}>{s.group.label} · {s.label}</span>
                </div>
                <div className="row sensor-val">
                  <span>
                    <span className="sub">{s.hint}</span>
                    <b className="t9" style={{ marginTop: "calc(2 * var(--u))" }}>{show(s, value)}</b>
                  </span>
                  {isCharted(s) && (
                    <span className="r">
                      <Sparkline values={history.map((h) => valueOf(s, h))} min={s.min ?? 0} max={maxOf(s, snapshot)} warn={state.warn} label={`${s.label} over the last two minutes`} />
                    </span>
                  )}
                </div>
                <div className="row ac" style={{ marginTop: "calc(7 * var(--u))" }}>
                  <Chip tone={state.warn ? "w" : undefined}>{state.text}</Chip>
                  {isCharted(s) && (
                    <button type="button" className="vd r" onClick={() => setOpenId(s.id)} aria-label={`View details: ${s.group.label} ${s.label}`}>View details</button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {open && (
        <Modal title={`${open.group.label} · ${open.label}`} onClose={() => setOpenId(null)}>
          <dl className="st">
            <div><dt>Now</dt><dd>{show(open, valueOf(open, snapshot))}</dd></div>
            <div><dt>Status</dt><dd>{statusOf(open, valueOf(open, snapshot)).text}</dd></div>
            <div><dt>Limit</dt><dd>{open.warnAt !== undefined ? show(open, open.warnAt) : "—"}</dd></div>
          </dl>
          <div className="chart" style={{ padding: 0, minHeight: "calc(100 * var(--u))" }}>
            <LineGraph
              series={[{ name: open.label, colour: "#1c7a2e", values: history.map((h) => valueOf(open, h)) }]}
              labels={history.map((h) => new Date(h.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }))}
              min={open.min ?? 0}
              max={maxOf(open, snapshot)}
              unit={(open.unit || "").trim()}
              digits={open.digits || 0}
              limit={open.warnAt}
              emptyText="Waiting for readings"
              summary={`${open.label} over the last two minutes`}
            />
          </div>
          <p className="txt">{open.hint} Updates every time the agent sends a reading.</p>
        </Modal>
      )}
    </div>
  );
}
