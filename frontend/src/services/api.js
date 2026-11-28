export const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/\/$/, "");

export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach Lectio's server. Check your internet connection and try again in a moment.";

/**
 * Every request in this file goes through here. When the server can't be
 * reached at all, the browser only says "Failed to fetch"; replace that with
 * a message people understand. Still a TypeError, so callers can detect it.
 */
async function fetch(url, options) {
  try {
    return await window.fetch(url, options);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    const friendly = new TypeError(NETWORK_ERROR_MESSAGE);
    friendly.network = true;
    throw friendly;
  }
}

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

export const AUTH_LOGOUT_EVENT = "telemetry:auth-logout";

// The access token lives only in this variable, never in storage, so a script
// injected into the page can't lift it from localStorage. A page load gets a
// fresh one from the HttpOnly refresh cookie (restoreSession).
let accessToken = null;

// Not a secret: just "this browser was signed in", so a logged-out visitor's
// page load skips the refresh call, and other tabs notice a sign-out.
const SIGNED_IN_KEY = "lectio_signed_in";
const LEGACY_TOKEN_KEY = "telemetry_jwt_token"; // where older builds kept the token

function storage(action) {
  try {
    return action(localStorage);
  } catch {
    return null; // storage unavailable (private mode, blocked site data)
  }
}

storage((s) => s.removeItem(LEGACY_TOKEN_KEY));

export function getAccessToken() {
  return accessToken;
}

function setAccessToken(token) {
  accessToken = token || null;
  storage((s) => (token ? s.setItem(SIGNED_IN_KEY, "1") : s.removeItem(SIGNED_IN_KEY)));
}

export function clearSession() {
  setAccessToken(null);
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
}

// Signing out in one tab signs out the others.
window.addEventListener("storage", (event) => {
  if (event.key === SIGNED_IN_KEY && !event.newValue && accessToken) {
    accessToken = null;
    window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
  }
});

/** Whether this browser may still have a sign-in to restore. */
export function hasSavedSession() {
  return storage((s) => s.getItem(SIGNED_IN_KEY)) === "1";
}

/**
 * On page load, trade the refresh cookie for an access token. Resolves to the
 * token, or null when there is no live sign-in.
 */
export async function restoreSession() {
  if (accessToken) return accessToken;
  if (!hasSavedSession()) return null;
  const token = await refreshAccessToken();
  if (!token) setAccessToken(null);
  return token;
}

async function readError(response, fallback) {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (d.msg || "").replace(/^Value error, /, "")).join(", ") || fallback;
  }
  // Some answers carry a reason code too: {"code": "...", "message": "..."}.
  if (detail && typeof detail === "object") return detail.message || fallback;
  return detail || body?.message || fallback;
}

/** An Error with the API's reason code (e.g. "email_not_verified"), when it gave one. */
async function apiError(response, fallback) {
  const copy = response.clone();
  const error = new Error(await readError(response, fallback));
  const body = await copy.json().catch(() => null);
  if (body?.detail && typeof body.detail === "object") error.code = body.detail.code;
  error.status = response.status;
  return error;
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
    throw await apiError(response, "Authentication failed");
  }

  const data = await response.json();
  setAccessToken(data.access_token);
  return data;
}

/** Confirm the email with the 6-digit code it was sent; signs in on success. */
export async function verifyEmailCode(email, code) {
  const response = await fetch(`${API_BASE}/api/v1/auth/verify-email-code`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!response.ok) throw await apiError(response, "That code didn't work. Try again.");
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
    // The refresh cookie is all the server needs, so this works even after the
    // access token expired (and must not try to refresh first).
    await fetch(`${API_BASE}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
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

/** Accounts with a password must re-enter it; Google-only accounts send none. */
export async function deleteAccount(password) {
  return apiJson(
    "/api/v1/auth/account",
    { method: "DELETE", body: JSON.stringify({ password: password || null }) },
    "Failed to delete account",
  );
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
    "Couldn't send a new code. Try again in a minute.",
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

/**
 * Stored snapshots for a device, newest first (the API caps one request at 1000).
 * With `points` (and a start), the API thins the range to that many snapshots
 * spread evenly across it, which is plenty for a graph and far less to download.
 */
export async function fetchTelemetryHistory(deviceId, { start = null, limit = 1000, points = null } = {}) {
  const params = new URLSearchParams({ device_id: deviceId, limit: String(limit) });
  if (start) params.append("start_time", start.toISOString());
  if (start && points) params.append("points", String(points));
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

/** Every open alert across all the user's PCs (for the bell's window). */
export async function fetchOpenAlerts() {
  const data = await apiJson("/api/v1/alerts?is_active=true&limit=100", {}, "Failed to load alerts");
  return data?.alerts || [];
}

/** The PC's end-of-day health checks, newest first (kept 30 days). */
export async function fetchReports(deviceId) {
  return apiJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/reports`, {}, "Couldn't load the daily checks");
}

/** Solve with AI: ask Lectio AI for a script for one alert (shown, not run). */
export async function requestAiScript(deviceId, alertId) {
  return apiJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/alerts/${encodeURIComponent(alertId)}/ai-script`,
    { method: "POST" },
    "Lectio AI couldn't write a script",
  );
}

/** Send the script that was shown to the PC (it still asks there first). */
export async function runAiScript(scriptId) {
  return apiJson(`/api/v1/ai-scripts/${encodeURIComponent(scriptId)}/run`, { method: "POST" }, "Couldn't send the script to your PC");
}

/** The PC's outages in the last 7 days, newest first, each with its story. */
export async function fetchIncidents(deviceId) {
  return apiJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/incidents`, {}, "Couldn't load the PC's outages");
}

/** The account's activity log, newest first (kept 7 days). kind: all, signin, alerts, fixes, pcs, security. */
export async function fetchActivity(kind = "all") {
  return apiJson(`/api/v1/activity?kind=${encodeURIComponent(kind)}`, {}, "Couldn't load your activity");
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
export async function alertFeedUrl() {
  const ticket = await fetchSocketTicket();
  return `${WS_ORIGIN}/api/v1/ws/alert-feed?token=${encodeURIComponent(ticket)}`;
}

/** Build the authenticated live-telemetry socket URL for a device. */
export async function telemetrySocketUrl(deviceId) {
  const ticket = await fetchSocketTicket();
  return `${WS_ORIGIN}/api/v1/ws/telemetry/${encodeURIComponent(deviceId)}?token=${encodeURIComponent(ticket)}`;
}

/**
 * A single-use, 30-second ticket for one WebSocket. The access token never
 * goes in a URL (URLs end up in server logs). On failure this returns "", the
 * server closes the socket with 1008, and the caller's retry takes over.
 */
async function fetchSocketTicket() {
  try {
    const response = await apiFetch("/api/v1/auth/ws-ticket", { method: "POST" });
    if (!response.ok) return "";
    return (await response.json()).ticket || "";
  } catch {
    return "";
  }
}
