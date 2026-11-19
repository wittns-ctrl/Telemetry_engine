import React, { useMemo, useState } from "react";
import { Table2 } from "lucide-react";
import { useDeviceStream } from "../hooks/useDeviceStream";
import { GROUPS, READING_COUNT, valueOf, maxOf, statusOf, show, isCharted } from "./readings";
import { Card, Head, Chip, LineGraph, Modal, Empty } from "./ui";
import { DeviceBar, StreamStatus, Sparkline } from "./live";
import { cx } from "./format";

// Metrics Studio: every reading the agent on the user's PC reports, one row
// each, updating as each snapshot arrives (every 2 seconds). Each row shows
// the value now, its limit, a line of the last two minutes and its status;
// clicking a row opens a larger graph.

const ALL = { id: "all", label: "All" };

/** The warning level as words: "Under 80°C", "Above 20%", "11.40 V to 12.60 V". */
function limitText(reading) {
  if (reading.kind === "text") return "—";
  if (reading.kind === "flag") return "Off";
  const { warnAt, warnBelow } = reading;
  if (warnAt !== undefined && warnBelow !== undefined) return `${show(reading, warnBelow)} to ${show(reading, warnAt)}`;
  if (warnAt !== undefined) return `Under ${show(reading, warnAt)}`;
  if (warnBelow !== undefined) return `Above ${show(reading, warnBelow)}`;
  return "—";
}

export function MetricsStudioView({ onNavigate }) {
  const stream = useDeviceStream();
  const { snapshot, history } = stream;
  const [groupId, setGroupId] = useState("all");
  const [openId, setOpenId] = useState(null);

  const readings = useMemo(() => GROUPS.flatMap((g) => g.readings.map((r) => ({ ...r, group: g }))), []);

  const status = StreamStatus({ stream, onNavigate });
  if (status) return <div className="page">{status}</div>;

  const groups = groupId === "all" ? GROUPS : GROUPS.filter((g) => g.id === groupId);
  const overLimit = readings.filter((r) => statusOf(r, valueOf(r, snapshot)).warn).length;
  const reported = readings.filter((r) => valueOf(r, snapshot) !== null).length;
  const open = openId ? readings.find((r) => r.id === openId) : null;
  const openValues = open ? history.map((s) => valueOf(open, s)) : [];

  return (
    <div className="page">
      <DeviceBar stream={stream}>
        <span className="sub">
          {reported} of {READING_COUNT} readings reported · <b style={{ color: overLimit ? "var(--rose-line)" : "#fff" }}>{overLimit}</b> over their limit
        </span>
      </DeviceBar>

      <Card className="pad col f1">
        <Head icon={Table2} title="Live readings">
          <span className="row" role="group" aria-label="Component" style={{ gap: "calc(3 * var(--u))", flexWrap: "wrap" }}>
            {[ALL, ...GROUPS].map((g) => (
              <button key={g.id} type="button" className={cx("chip", g.id === groupId ? "k" : "o")} aria-pressed={g.id === groupId} onClick={() => setGroupId(g.id)}>
                {g.label}
              </button>
            ))}
          </span>
        </Head>

        {!snapshot ? (
          <Empty title="Waiting for the first reading">
            <span>Readings appear here as soon as the agent on {stream.device?.device_name || "your PC"} sends one.</span>
          </Empty>
        ) : (
          <div className="tb-wrap tb-tall">
            <table className="tb live-tb">
              <thead>
                <tr>
                  <th>Reading</th>
                  <th>Now</th>
                  <th className="hide-sm">Limit</th>
                  <th className="hide-sm">Last 2 minutes</th>
                  <th>Status</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.id}>
                  {groupId === "all" && (
                    <tr className="tb-group"><th colSpan={5} scope="colgroup">{group.label}</th></tr>
                  )}
                  {group.readings.map((reading) => {
                    const value = valueOf(reading, snapshot);
                    const state = statusOf(reading, value);
                    const charted = isCharted(reading);
                    return (
                      <tr key={reading.id} className={cx(state.warn && "warn")}>
                        <td>
                          {charted ? (
                            <button type="button" className="lnk" onClick={() => setOpenId(reading.id)} aria-label={`View details: ${group.label} ${reading.label}`}>
                              {reading.label}
                            </button>
                          ) : reading.label}
                        </td>
                        <td className="now">{show(reading, value)}</td>
                        <td className="hide-sm sub">{limitText(reading)}</td>
                        <td className="hide-sm">
                          {charted ? (
                            <Sparkline
                              values={history.map((s) => valueOf(reading, s))}
                              min={reading.min ?? 0}
                              max={maxOf(reading, snapshot)}
                              warn={state.warn}
                              label={`${group.label} ${reading.label} over the last two minutes`}
                            />
                          ) : <span className="sub">—</span>}
                        </td>
                        <td><Chip tone={value === null ? "n" : state.warn ? "w" : undefined}>{state.text}</Chip></td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Card>

      {open && (
        <Modal title={`${open.group.label} · ${open.label}`} onClose={() => setOpenId(null)}>
          <dl className="st">
            <div><dt>Now</dt><dd>{show(open, valueOf(open, snapshot))}</dd></div>
            <div><dt>Limit</dt><dd>{limitText(open)}</dd></div>
            <div><dt>Readings</dt><dd>{openValues.filter((v) => v !== null).length}</dd></div>
          </dl>
          <div className="chart" style={{ padding: 0, minHeight: "calc(120 * var(--u))" }}>
            <LineGraph
              series={[{ name: open.label, colour: "#1c7a2e", values: openValues }]}
              labels={history.map((s) => new Date(s.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }))}
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
