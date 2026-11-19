import React from "react";
import { Monitor } from "lucide-react";
import { Card, Chip, Empty } from "./ui";
import { cx, timeAgo } from "./format";

// Pieces shared by the pages that show a PC's readings live (Metrics Studio,
// Live Monitor, Analytics, Sensors), all fed by hooks/useDeviceStream.js.

const CONNECTION_TEXT = { live: "Live", connecting: "Connecting…", offline: "Offline" };

/** The PC being shown, a picker when there are several, and whether readings are arriving. */
export function DeviceBar({ stream, children, showConnection = true }) {
  const { devices, deviceId, setDeviceId, device, snapshot, connection } = stream;
  const live = connection === "live";
  return (
    <Card className="row ac wrap dk live-bar">
      {showConnection && <i className={cx("dot", !live && "off")} aria-hidden="true" />}
      {devices.length > 1 ? (
        <select className="inp" style={{ width: "auto" }} aria-label="PC" value={deviceId || ""} onChange={(e) => setDeviceId(e.target.value)}>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.device_name}</option>)}
        </select>
      ) : (
        <b className="t7">{device?.device_name}</b>
      )}
      {showConnection && <Chip tone={live ? undefined : "n"}>{CONNECTION_TEXT[connection]}</Chip>}
      <span className="sub" role="status">
        {snapshot ? `Last reading ${timeAgo(snapshot.timestamp)}` : "Waiting for the first reading"}
      </span>
      {children && <span className="r row ac wrap" style={{ gap: "calc(4 * var(--u))" }}>{children}</span>}
    </Card>
  );
}

/** Loading, error and "no PC yet" states, or null when there is a PC to show. */
export function StreamStatus({ stream, onNavigate }) {
  if (stream.state === "loading") {
    return <Card className="pad col f1"><Empty title="Loading your PCs…" /></Card>;
  }
  if (stream.state === "error") {
    return (
      <Card className="pad col">
        <p className="note w" role="alert">{stream.error}</p>
        <div><button type="button" className="bk" onClick={stream.reload}>Try again</button></div>
      </Card>
    );
  }
  if (stream.state === "no-devices") {
    return (
      <Card className="pad col f1">
        <Empty title="No PC connected yet">
          <span>Run the Lectio agent on your PC and its readings appear here as they arrive.</span>
          <button type="button" className="bk gr" onClick={() => onNavigate?.("devices")}>
            <Monitor strokeWidth={1.9} aria-hidden="true" /> Connect a PC
          </button>
        </Empty>
      </Card>
    );
  }
  return null;
}

/** A tiny line of the last readings; rose when the latest is over its limit. */
export function Sparkline({ values, min = 0, max = 100, warn, label }) {
  const points = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (points.length < 2) return <span className="sub" aria-hidden="true">—</span>;
  const w = 72;
  const h = 18;
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 1 - ((Math.min(max, Math.max(min, v)) - min) / span) * (h - 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline fill="none" stroke={warn ? "var(--rose-text)" : "var(--green-dark)"} strokeWidth="1.6" strokeLinejoin="round" points={path} />
    </svg>
  );
}
