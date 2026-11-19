import { useState, useEffect, useRef, useCallback } from "react";
import { WS_BASE, getAccessToken, refreshAccessToken } from "../services/api";
import { playAlertSound } from "../utils/sound";

/** The user id inside an access token, or null if it can't be read. */
function tokenUser(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)).sub ?? null;
  } catch {
    return null;
  }
}

export function useTelemetryWebSocket({
  soundEnabled = true,
  maxDataPoints = 60,
} = {}) {
  const [status, setStatus] = useState("connecting"); // 'connecting' | 'connected' | 'disconnected' | 'error'
  const [alerts, setAlerts] = useState([]);
  const [liveMetrics, setLiveMetrics] = useState([]);
  const [latestMetric, setLatestMetric] = useState(null);
  const [latestAlert, setLatestAlert] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isUnmountingRef = useRef(false);

  const connect = useCallback(() => {
    if (isUnmountingRef.current) return;

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // The socket needs a signed-in user; wait and check again until there is one.
    const token = getAccessToken();
    if (!token) {
      setStatus("disconnected");
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
      return;
    }

    setStatus("connecting");

    try {
      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      const userId = tokenUser(token);
      let opened = false;

      ws.onopen = () => {
        opened = true;
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        // Signed out or switched accounts since connecting: drop this socket's
        // events and reconnect as whoever is signed in now. Compare the user,
        // not the token string, so a routine token refresh keeps the socket.
        const current = getAccessToken();
        if (!current || tokenUser(current) !== userId) {
          ws.close();
          return;
        }
        try {
          const data = JSON.parse(event.data);

          // Handle threshold breach alert
          if (data.event === "THRESHOLD_BREACH" || data.severity) {
            const alertItem = {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              receivedAt: new Date().toISOString(),
              ...data,
            };

            setAlerts((prev) => [alertItem, ...prev.slice(0, 99)]);
            setLatestAlert(alertItem);

            if (soundEnabled) {
              playAlertSound();
            }
          }

          // Handle metric recorded event
          // (A breach alert also names its metric_type, so match the event
          // itself: otherwise each alert is counted as a second reading.)
          if (data.event === "METRIC_RECORDED") {
            const point = {
              id:
                data.metric_id ||
                `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              sensor_id: data.sensor_id,
              metric_type: data.metric_type,
              value: Number(data.value),
              payload_data: data.payload_data || {},
              timestamp: data.timestamp || new Date().toISOString(),
              alert_triggered: !!data.alert_triggered,
              timeLabel: new Date(
                data.timestamp || Date.now(),
              ).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
            };

            setLatestMetric(point);
            setLiveMetrics((prev) => {
              const updated = [...prev, point];
              if (updated.length > maxDataPoints) {
                return updated.slice(updated.length - maxDataPoints);
              }
              return updated;
            });
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onerror = () => {
        setStatus("error");
      };

      ws.onclose = async () => {
        // A socket that has already been replaced (for example by a remount)
        // must not refresh the token or schedule another connection.
        if (wsRef.current !== ws) return;
        if (!isUnmountingRef.current) {
          setStatus("disconnected");
          // A socket that never opened was most likely rejected for an expired
          // token; refresh before retrying so the next attempt uses a fresh one.
          if (!opened) await refreshAccessToken();
          if (isUnmountingRef.current) return;
          // Reconnect with 3 second delay
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    } catch (err) {
      console.error("WebSocket connection error:", err);
      setStatus("error");
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 4000);
    }
  }, [soundEnabled, maxDataPoints]);

  useEffect(() => {
    isUnmountingRef.current = false;
    connect();

    return () => {
      isUnmountingRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const dismissAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    status,
    alerts,
    liveMetrics,
    latestMetric,
    latestAlert,
    clearAlerts,
    dismissAlert,
    reconnect: connect,
  };
}
