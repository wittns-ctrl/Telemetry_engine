import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDevices,
  fetchLatestTelemetry,
  fetchTelemetryHistory,
  fetchDeviceAlerts,
  telemetrySocketUrl,
  refreshAccessToken,
} from "../services/api";

/**
 * Live readings from the agent on one of the user's PCs.
 *
 * Loads the user's devices and picks the first (or the one chosen with
 * setDeviceId), then for that device: the readings from the last `windowMs`,
 * its active alerts, and a WebSocket that delivers each new snapshot the agent
 * sends (every 2 seconds) and any new alerts.
 *
 * Returns:
 *   devices, deviceId, setDeviceId, device
 *   snapshot   latest TelemetrySnapshot, or null before the first one
 *   history    snapshots oldest first, at most `maxPoints`
 *   alerts     active alerts, newest first
 *   state      "loading" | "no-devices" | "error" | "ready"
 *   connection "connecting" | "live" | "offline"
 *   error, reload
 */
export function useDeviceStream({ windowMs = 2 * 60 * 1000, maxPoints = 60 } = {}) {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const currentId = useRef(null);

  const loadDevices = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const list = (await fetchDevices())?.devices || [];
      setDevices(list);
      setDeviceId((current) => (current && list.some((d) => d.id === current) ? current : list[0]?.id || null));
      setState(list.length ? "ready" : "no-devices");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const push = useCallback((snap) => {
    if (!snap) return;
    setSnapshot(snap);
    setHistory((prev) => {
      if (prev.length && prev[prev.length - 1].timestamp === snap.timestamp) return prev;
      return [...prev.slice(-(maxPoints - 1)), snap];
    });
  }, [maxPoints]);

  // Recent readings and active alerts whenever the device changes.
  useEffect(() => {
    if (!deviceId) return undefined;
    let cancelled = false;
    currentId.current = deviceId;
    setSnapshot(null);
    setHistory([]);
    setAlerts([]);

    Promise.all([
      fetchTelemetryHistory(deviceId, { start: new Date(Date.now() - windowMs), limit: maxPoints }).catch(() => null),
      fetchLatestTelemetry(deviceId).catch(() => null), // 404 until the agent sends its first snapshot
      fetchDeviceAlerts(deviceId, { activeOnly: true }).catch(() => null),
    ]).then(([stored, latest, active]) => {
      if (cancelled) return;
      // The API returns history newest first.
      const recent = [...(stored?.snapshots || [])].reverse();
      setHistory(recent);
      setSnapshot(latest || recent[recent.length - 1] || null);
      setAlerts(active?.alerts || []);
    });

    return () => {
      cancelled = true;
    };
  }, [deviceId, windowMs, maxPoints]);

  // The live socket for the device.
  useEffect(() => {
    if (!deviceId) return undefined;
    let disposed = false;
    let socket = null;
    let retry = null;
    let attempts = 0;

    const connect = async () => {
      if (disposed) return;
      setConnection("connecting");
      const url = await telemetrySocketUrl(deviceId);
      if (disposed) return;
      socket = new WebSocket(url);

      socket.onopen = () => {
        attempts = 0;
        setConnection("live");
      };

      socket.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (currentId.current !== deviceId) return;
        if (data.type === "telemetry" && data.telemetry) push(data.telemetry);
        if (Array.isArray(data.alerts) && data.alerts.length) {
          setAlerts((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            return [...data.alerts.filter((a) => !seen.has(a.id)), ...prev].slice(0, 50);
          });
        }
      };

      socket.onclose = async (event) => {
        if (disposed) return;
        setConnection("offline");
        // 1008 = policy violation: usually an expired access token.
        if (event.code === 1008) await refreshAccessToken();
        const delay = Math.min(30000, 1000 * 2 ** attempts);
        attempts += 1;
        retry = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      if (socket) socket.close();
    };
  }, [deviceId, push]);

  const device = devices.find((d) => d.id === deviceId) || null;
  return { devices, deviceId, setDeviceId, device, snapshot, history, alerts, state, connection, error, reload: loadDevices };
}
