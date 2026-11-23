export const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/\/$/, "");

// The Windows agent, served by the API itself (app/api/v1/agent_download.py).
// VITE_AGENT_DOWNLOAD_URL points the buttons somewhere else instead.
export const AGENT_DOWNLOAD_URL = import.meta.env.VITE_AGENT_DOWNLOAD_URL || `${API_BASE}/api/v1/agent/download`;

/** Whether this server has an agent to hand out: { available, size_mb, updated_at, sha256 }. */
export async function fetchAgentDownloadInfo() {
  if (import.meta.env.VITE_AGENT_DOWNLOAD_URL) return { available: true };
  const response = await fetch(`${API_BASE}/api/v1/agent/download/info`);
  if (!response.ok) throw new Error("Could not check the agent download");
  return response.json();
}

// WebSocket origin defaults to the API origin with ws:// or wss:// swapped in.
export const WS_ORIGIN = (import.meta.env.VITE_WS_ORIGIN || API_BASE.replace(/^http/, "ws")).replace(/\/$/, "");

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

/** Change the name and/or the alert-email setting. Resolves to the changed user fields. */
export async function updateProfile({ fullName, emailAlerts, fixLevel }) {
  const changes = {};
  if (fullName !== undefined) changes.full_name = fullName;
  if (emailAlerts !== undefined) changes.email_alerts = emailAlerts;
  if (fixLevel !== undefined) changes.fix_level = fixLevel;
  return apiJson(
    "/api/v1/auth/profile",
    { method: "PATCH", body: JSON.stringify(changes) },
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

export async function deleteAccount() {
  return apiJson("/api/v1/auth/account", { method: "DELETE" }, "Failed to delete account");
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

// ---------------------------------------------------------------------------
// Fixes: chosen on the website, carried out by the PC's agent
// ---------------------------------------------------------------------------

/** Fix options for one alert, best first: { fix_level, source, options: [...] }. */
export async function fetchFixSuggestions(deviceId, alertId) {
  return apiJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/fixes/suggestions?alert_id=${encodeURIComponent(alertId)}`,
    {},
    "Couldn't load fixes for this alert",
  );
}

/** Ask the PC to run a fix. */
export async function requestFix(deviceId, { fixId, params, alertId }) {
  return apiJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/fixes`,
    { method: "POST", body: JSON.stringify({ fix_id: fixId, params: params || {}, alert_id: alertId || null }) },
    "Couldn't send the fix to your PC",
  );
}

/** Everything asked of one PC, newest first. */
export async function fetchFixHistory(deviceId, { limit = 50 } = {}) {
  return apiJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/fixes?limit=${limit}`,
    {},
    "Couldn't load the fix history",
  );
}

export async function cancelFix(fixRequestId) {
  return apiJson(`/api/v1/fixes/${encodeURIComponent(fixRequestId)}/cancel`, { method: "POST" }, "Couldn't cancel the fix");
}

export async function undoFix(fixRequestId) {
  return apiJson(`/api/v1/fixes/${encodeURIComponent(fixRequestId)}/undo`, { method: "POST" }, "Couldn't undo the fix");
}

/** Country names a device can be placed in: exactly the names the dashboard map draws. */
export async function fetchDeviceCountries() {
  return apiJson("/api/v1/devices/countries", {}, "Failed to load countries");
}

// Fired after an alert is closed or a device removed, so the header's open
// alert count updates at once instead of on its next 30-second refresh.
export const ALERTS_CHANGED_EVENT = "lectio:alerts-changed";
const alertsChanged = () => window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));

/** Close an alert by hand. If the reading is still over its limit, Lectio raises it again later. */
export async function closeAlert(alertId) {
  const result = await apiJson(
    `/api/v1/alerts/${encodeURIComponent(alertId)}/acknowledge`,
    { method: "PATCH", body: JSON.stringify({ acknowledged: true }) },
    "Could not close this alert",
  );
  alertsChanged();
  return result;
}

/** Remove a device with its readings, alerts and fix history. Its agent stops being accepted. */
export async function deleteDevice(deviceId) {
  await apiJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
    "Could not remove this device",
  );
  alertsChanged();
}

/** Rename a device and/or set its country (country: null takes it off the map). */
export async function updateDevice(deviceId, changes) {
  return apiJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}`,
    { method: "PATCH", body: JSON.stringify(changes) },
    "Failed to update device",
  );
}

export async function fetchLatestTelemetry(deviceId) {
  return apiJson(
    `/api/v1/metrics/latest?device_id=${encodeURIComponent(deviceId)}`,
    {},
    "Failed to load latest telemetry",
  );
}

/** Stored snapshots for a device, newest first (the API caps one request at 1000). */
export async function fetchTelemetryHistory(deviceId, { start = null, limit = 1000 } = {}) {
  const params = new URLSearchParams({ device_id: deviceId, limit: String(limit) });
  if (start) params.append("start_time", start.toISOString());
  return apiJson(`/api/v1/metrics/history?${params.toString()}`, {}, "Failed to load telemetry history");
}

/**
 * A device's main readings averaged per hour (period "24h") or per day ("7d",
 * "30d"): { bucket, buckets: [{ start, count, readings: { cpu_util: { avg, max }, ... } }] },
 * oldest first. Worked out by the API over the whole period.
 */
export async function fetchMetricsTrend(deviceId, period = "24h") {
  const params = new URLSearchParams({ device_id: deviceId, period });
  return apiJson(`/api/v1/metrics/trend?${params.toString()}`, {}, "Failed to load the trend");
}

/** How many alerts are open across all the user's PCs (for the header bell). */
export async function fetchOpenAlertCount() {
  const data = await apiJson("/api/v1/alerts?is_active=true&limit=500", {}, "Failed to load alerts");
  return data?.alerts?.length ?? 0;
}

export async function fetchDeviceAlerts(deviceId, { activeOnly = false, limit = 50, start = null } = {}) {
  const params = new URLSearchParams({ device_id: deviceId, limit: String(limit) });
  if (activeOnly) params.append("is_active", "true");
  if (start) params.append("start_time", start.toISOString());
  return apiJson(`/api/v1/alerts?${params.toString()}`, {}, "Failed to load alerts");
}

/**
 * Ask the API for a diagnostic report on one stored alert.
 * Resolves to the report: { alert_id, device_id, generated_at, analysis_method
 * ("LLM" | "rule_based"), root_cause_analysis, urgency_level, actionable_steps:
 * [{ step_number, instruction, category, estimated_time_minutes }], additional_context }.
 * Without a Gemini key the API still answers, with analysis_method "rule_based".
 */
export async function requestDiagnosis(alertId, deviceId) {
  const data = await apiJson(
    "/api/v1/diagnostics/analyze",
    { method: "POST", body: JSON.stringify({ alert_id: alertId, device_id: deviceId }) },
    "Could not generate a report for this alert",
  );
  return data.report;
}

/** Every new or updated alert on any of the user's PCs, for the alert pop-up. */
export function alertFeedUrl() {
  const token = getAccessToken() || "";
  return `${WS_ORIGIN}/api/v1/ws/alert-feed?token=${encodeURIComponent(token)}`;
}

/** Build the authenticated live-telemetry socket URL for a device. */
export function telemetrySocketUrl(deviceId) {
  const token = getAccessToken() || "";
  return `${WS_ORIGIN}/api/v1/ws/telemetry/${encodeURIComponent(deviceId)}?token=${encodeURIComponent(token)}`;
}
