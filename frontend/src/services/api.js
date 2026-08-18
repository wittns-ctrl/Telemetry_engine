const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
export const WS_BASE =
  import.meta.env.VITE_WS_BASE || "ws://localhost:8000/ws/alerts";

function getAuthHeaders() {
  const token = localStorage.getItem("telemetry_jwt_token");
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function loginUser(email, password) {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ detail: "Login failed" }));
    throw new Error(errorData.detail || "Authentication failed");
  }

  return response.json();
}

export async function signupUser(email, password) {
  const response = await fetch(`${API_BASE}/api/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ detail: "Signup failed" }));
    throw new Error(errorData.detail || "Signup failed");
  }

  return response.json();
}

export async function fetchCurrentUser() {
  const token = localStorage.getItem("telemetry_jwt_token");
  if (!token) return null;

  const response = await fetch(`${API_BASE}/api/v1/users/me`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    localStorage.removeItem("telemetry_jwt_token");
    return null;
  }

  return response.json();
}

export async function fetchMetrics({
  limit = 50,
  metricType = null,
  sensorId = null,
} = {}) {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit);
  if (metricType && metricType !== "all")
    params.append("metric_type", metricType);
  if (sensorId && sensorId !== "all") params.append("sensor_id", sensorId);

  const url = `${API_BASE}/api/v1/metrics?${params.toString()}`;
  const response = await fetch(url, { headers: getAuthHeaders() });

  if (!response.ok) {
    throw new Error("Failed to fetch metrics");
  }

  return response.json();
}

export async function fetchStats() {
  const response = await fetch(`${API_BASE}/api/v1/metrics/stats`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch metrics stats");
  }
  return response.json();
}

export async function fetchThresholds() {
  const response = await fetch(`${API_BASE}/api/v1/thresholds`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch thresholds");
  }
  return response.json();
}

export async function fetchHealth() {
  const response = await fetch(`${API_BASE}/api/v1/health`);
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return response.json();
}

export async function ingestMetric(payload) {
  const response = await fetch(`${API_BASE}/api/v1/metrics`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ detail: "Ingestion failed" }));
    throw new Error(
      err.detail
        ? Array.isArray(err.detail)
          ? err.detail.map((d) => d.msg).join(", ")
          : err.detail
        : "Ingestion failed",
    );
  }

  return response.json();
}
