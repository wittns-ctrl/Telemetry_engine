import { useCallback, useEffect, useState } from "react";
import { BACKEND_DISABLED, fetchMetrics } from "../services/api";
import { SAMPLE_METRICS } from "../components/sampleData";

/**
 * The account's most recent stored readings, newest first. Analytics and
 * Sensors work their figures out from this list. In frontend-only mode it
 * returns the sample readings.
 */
export function useRecentMetrics(limit = 100) {
  const [metrics, setMetrics] = useState(() => (BACKEND_DISABLED ? SAMPLE_METRICS.slice(0, limit) : []));
  const [loading, setLoading] = useState(!BACKEND_DISABLED);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (BACKEND_DISABLED) return;
    setLoading(true);
    setError(null);
    try {
      setMetrics(await fetchMetrics({ limit }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { metrics, loading, error, reload };
}
