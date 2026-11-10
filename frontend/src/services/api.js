export const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/\/$/, "");

// WebSocket origin defaults to the API origin with ws:// or wss:// swapped in.
export const WS_ORIGIN = (import.meta.env.VITE_WS_ORIGIN || API_BASE.replace(/^http/, "ws")).replace(/\/$/, "");

// Legacy broadcast socket used by the original dashboard views.
export const WS_BASE = import.meta.env.VITE_WS_BASE || `${WS_ORIGIN}/ws/alerts`;

const TOKEN_KEY = "telemetry_jwt_token";

export const AUTH_LOGOUT_EVENT = "telemetry:auth-logout";

export function getAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setAccessToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearSession() {
  setAccessToken(null);
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
}

async function readError(response, fallback) {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (d.msg || "").replace(/^Value error, /, "")).join(", ") || fallback;
  }
  return detail || body?.message || fallback;
}

// Shared refresh so parallel 401s trigger only one refresh request.
let refreshPromise = null;

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return null;
      const data = await response.json();
      setAccessToken(data.access_token);
      return data.access_token;
    })()
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * fetch wrapper: adds the bearer token, sends cookies, and on a 401 refreshes
 * the access token once and retries. If the refresh fails the session is cleared.
 */
async function apiFetch(path, { auth = true, headers = {}, ...options } = {}) {
  const doFetch = () => {
    const finalHeaders = { ...headers };
    if (options.body && typeof options.body === "string" && !finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
    const token = auth ? getAccessToken() : null;
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, { credentials: "include", ...options, headers: finalHeaders });
  };

  let response = await doFetch();
  if (auth && response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await doFetch();
    }
    if (response.status === 401) {
      clearSession();
    }
  }
  return response;
}

async function apiJson(path, options = {}, fallbackError = "Request failed") {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    throw new Error(await readError(response, fallbackError));
  }
  if (response.status === 204) return null;
  return response.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginUser(email, password) {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Authentication failed"));
  }

  const data = await response.json();
  setAccessToken(data.access_token);
  return data;
}

// Google sign-in is a full-page redirect: API -> Google -> API -> /signin?google=success.
export function startGoogleSignIn() {
  window.location.assign(`${API_BASE}/api/v1/auth/google/login`);
}

export const GOOGLE_ERROR_MESSAGES = {
  google_not_configured: "Google sign-in is not set up on this server yet.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state_mismatch: "Google sign-in expired or was interrupted. Please try again.",
  google_email_unverified: "Your Google account's email address is not verified.",
  google_failed: "Could not sign in with Google. Please try again.",
  account_inactive: "This account has been deactivated.",
};

/**
 * Finish a Google sign-in after the redirect back: the API has set the refresh
 * cookie, so trade it for an access token.
 */
export async function completeGoogleSignIn() {
  const token = await refreshAccessToken();
  if (!token) throw new Error(GOOGLE_ERROR_MESSAGES.google_failed);
  return token;
}

export async function signupUser({ fullName, email, password, confirmPassword }) {
  return apiJson(
    "/api/v1/auth/register",
    {
      auth: false,
      method: "POST",
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
        confirm_password: confirmPassword,
      }),
    },
    "Signup failed",
  );
}

export async function fetchCurrentUser() {
  if (!getAccessToken()) return null;
  const response = await apiFetch("/api/v1/auth/me");
  if (!response.ok) return null;
  return response.json();
}

export async function logoutUser() {
  try {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* ignore network errors on logout */
  } finally {
    setAccessToken(null);
  }
}

export async function updateProfile({ fullName }) {
  return apiJson(
    "/api/v1/auth/profile",
    { method: "PATCH", body: JSON.stringify({ full_name: fullName }) },
    "Failed to update profile",
  );
}

export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  return apiJson(
    "/api/v1/auth/change-password",
    {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    },
    "Failed to change password",
  );
}

export async function deactivateAccount() {
  return apiJson("/api/v1/auth/account", { method: "DELETE" }, "Failed to deactivate account");
}

export async function forgotPassword(email) {
  return apiJson(
    "/api/v1/auth/forgot-password",
    { auth: false, method: "POST", body: JSON.stringify({ email }) },
    "Failed to request password reset",
  );
}

export async function resetPassword(token, newPassword, confirmPassword) {
  return apiJson(
    "/api/v1/auth/reset-password",
    {
      auth: false,
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword, confirm_password: confirmPassword }),
    },
    "Failed to reset password",
  );
}

export async function verifyEmail(token) {
  return apiJson(
    "/api/v1/auth/verify-email",
    { auth: false, method: "POST", body: JSON.stringify({ token }) },
    "Verification failed",
  );
}

export async function resendVerification(email) {
  return apiJson(
    "/api/v1/auth/resend-verification",
    { auth: false, method: "POST", body: JSON.stringify({ email }) },
    "Failed to resend verification email",
  );
}

// ---------------------------------------------------------------------------
// Devices & hardware telemetry
// ---------------------------------------------------------------------------

export async function fetchDevices() {
  return apiJson("/api/v1/devices", {}, "Failed to load devices");
}

export async function fetchLatestTelemetry(deviceId) {
  return apiJson(
    `/api/v1/metrics/latest?device_id=${encodeURIComponent(deviceId)}`,
    {},
    "Failed to load latest telemetry",
  );
}

export async function fetchDeviceAlerts(deviceId, { activeOnly = false, limit = 50 } = {}) {
  const params = new URLSearchParams({ device_id: deviceId, limit: String(limit) });
  if (activeOnly) params.append("is_active", "true");
  return apiJson(`/api/v1/alerts?${params.toString()}`, {}, "Failed to load alerts");
}

/** Build the authenticated live-telemetry socket URL for a device. */
export function telemetrySocketUrl(deviceId) {
  const token = getAccessToken() || "";
  return `${WS_ORIGIN}/api/v1/ws/telemetry/${encodeURIComponent(deviceId)}?token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Legacy metric endpoints (used by the original dashboard views)
// ---------------------------------------------------------------------------

export async function fetchMetrics({ limit = 50, metricType = null, sensorId = null } = {}) {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit);
  if (metricType && metricType !== "all") params.append("metric_type", metricType);
  if (sensorId && sensorId !== "all") params.append("sensor_id", sensorId);
  return apiJson(`/api/v1/metrics?${params.toString()}`, {}, "Failed to fetch metrics");
}

export async function fetchStats() {
  return apiJson("/api/v1/metrics/stats", {}, "Failed to fetch metrics stats");
}

export async function fetchThresholds() {
  return apiJson("/api/v1/thresholds", {}, "Failed to fetch thresholds");
}

export async function fetchHealth() {
  return apiJson("/api/v1/health", { auth: false }, "Health check failed");
}

export async function ingestMetric(payload) {
  return apiJson(
    "/api/v1/metrics",
    { method: "POST", body: JSON.stringify(payload) },
    "Ingestion failed",
  );
}
