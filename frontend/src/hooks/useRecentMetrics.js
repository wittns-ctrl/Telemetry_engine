import { useCallback, useEffect, useState } from "react";
import { fetchMetrics } from "../services/api";

/**
 * The account's most recent stored readings, newest first. Analytics and
 * Sensors work their figures out from this list.
 */
export function useRecentMetrics(limit = 100) {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
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
