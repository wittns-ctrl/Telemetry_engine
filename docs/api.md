# API reference

Base URL: `https://getlectio.vercel.app/api/v1` from the website (proxied by
Vercel), `https://telemetry-engine-w57g.onrender.com/api/v1` for agents. All
bodies are JSON unless noted. The interactive documentation (`/docs`) is
available only when the API runs with `APP_ENV=development`.

## Authentication

| Caller | How |
| --- | --- |
| Website | `Authorization: Bearer <access token>` (15-minute JWT from sign-in or `/auth/refresh`). The refresh token is an HttpOnly cookie sent automatically to `/api/v1/auth/*`. |
| Agent | `X-Device-Key: <key>`, issued when the PC is linked; stored hashed on the server. |
| WebSocket | `?token=<ticket>` from `POST /auth/ws-ticket` (single use, short-lived). |

Errors use FastAPI's shape: `{"detail": "..."}` or a list of field errors
(422). Rate-limited requests get `429` with `Retry-After`; every limited
response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`.

| Limit | Default | Keyed on |
| --- | --- | --- |
| Sign-in and account recovery | 10 / minute | visitor's address (and 10x on the connecting address) |
| Signed-in requests | 60 / minute | user |
| Agent uploads and check-ins | 120 / minute | device key |
| Asking a PC to run or undo a fix | 10 / minute | user |

## Endpoints


### Agent

| Method | Path | What it does | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/agent/alerts/pending` | Agent: New Critical Alerts to Show on the PC | device key |
| `GET` | `/api/v1/agent/location` | Agent: Should This PC Report Its Location? | device key |
| `POST` | `/api/v1/agent/location` | Agent: Report This PC's Location | device key |

### Agent Download

| Method | Path | What it does | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/agent/download` | Download the Windows Agent | none |
| `GET` | `/api/v1/agent/download/info` | Is the Windows Agent Available | none |

### Authentication

| Method | Path | What it does | Auth |
| --- | --- | --- | --- |
| `DELETE` | `/api/v1/auth/account` | Delete Account | signed in |
| `POST` | `/api/v1/auth/change-password` | Change Password | signed in |
| `POST` | `/api/v1/auth/forgot-password` | Forgot Password | none |
| `GET` | `/api/v1/auth/google/callback` | Google Callback | none |
| `GET` | `/api/v1/auth/google/login` | Google Login | none |
| `POST` | `/api/v1/auth/login` | Login | none |
| `POST` | `/api/v1/auth/logout` | Logout | signed in |
| `GET` | `/api/v1/auth/me` | Get Current User Endpoint | signed in |
| `PATCH` | `/api/v1/auth/profile` | Update Profile | signed in |
| `POST` | `/api/v1/auth/refresh` | Refresh Token | none |
| `POST` | `/api/v1/auth/register` | Register | none |
| `POST` | `/api/v1/auth/resend-verification` | Resend Verification | none |
| `POST` | `/api/v1/auth/reset-password` | Reset Password | none |
| `POST` | `/api/v1/auth/verify-email` | Verify Email | none |
| `POST` | `/api/v1/auth/verify-email-code` | Verify Email Code | none |
| `POST` | `/api/v1/auth/ws-ticket` | Ws Ticket | signed in |

### Fixes

| Method | Path | What it does | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/agent/fixes/next` | Agent: Check In and Take the Next Fix | device key |
| `POST` | `/api/v1/agent/fixes/{fix_request_id}/result` | Agent: Report a Fix Result | device key |
| `POST` | `/api/v1/agent/fixes/{fix_request_id}/reverted` | Agent: A Timed Fix Ran Out | device key |
| `GET` | `/api/v1/devices/{device_id}/fixes` | Fix History | signed in |
| `POST` | `/api/v1/devices/{device_id}/fixes` | Ask the PC to Run a Fix | signed in |
| `GET` | `/api/v1/devices/{device_id}/fixes/suggestions` | Fixes for an Alert | signed in |
| `GET` | `/api/v1/fixes/catalogue` | List Every Fix | signed in |
| `POST` | `/api/v1/fixes/{fix_request_id}/cancel` | Cancel a Fix | signed in |
| `POST` | `/api/v1/fixes/{fix_request_id}/undo` | Undo a Fix | signed in |

### Other

| Method | Path | What it does | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/alerts` | List Alerts | signed in |
| `GET` | `/api/v1/alerts/by-rule/{rule_name}` | Get Alerts by Rule | signed in |
| `GET` | `/api/v1/alerts/statistics` | Get Alert Statistics | signed in |
| `DELETE` | `/api/v1/alerts/{alert_id}` | Delete Alert | signed in |
| `GET` | `/api/v1/alerts/{alert_id}` | Get Alert Details | signed in |
| `PATCH` | `/api/v1/alerts/{alert_id}/acknowledge` | Acknowledge Alert | signed in |
| `GET` | `/api/v1/devices` | List User Devices | signed in |
| `GET` | `/api/v1/devices/countries` | List Device Countries | signed in |
| `POST` | `/api/v1/devices/register` | Register a Device | signed in |
| `DELETE` | `/api/v1/devices/{device_id}` | Delete Device | signed in |
| `GET` | `/api/v1/devices/{device_id}` | Get Device Details | signed in |
| `PATCH` | `/api/v1/devices/{device_id}` | Update a Device | signed in |
| `POST` | `/api/v1/diagnostics/analyze` | Generate AI Diagnostic Report | signed in |
| `GET` | `/api/v1/diagnostics/health` | Diagnostic Service Health Check | signed in |
| `GET` | `/api/v1/metrics/history` | Query Historical Telemetry | signed in |
| `GET` | `/api/v1/metrics/latest` | Get Latest Telemetry Snapshot | signed in |
| `GET` | `/api/v1/metrics/summary` | Get Telemetry Summary | signed in |
| `GET` | `/api/v1/metrics/trend` | Readings Averaged per Hour or Day | signed in |

### System

| Method | Path | What it does | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/db-stats` | Database and Ingest Performance | admin |
| `GET` | `/api/v1/health` | Health Check | none |

### Telemetry Ingest

| Method | Path | What it does | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/telemetry/ingest` | Ingest a Hardware Telemetry Snapshot | device key |
| `POST` | `/api/v1/telemetry/ingest/batch` | Ingest Several Readings at Once | device key |


### WebSocket streams

| Path | What it streams |
| --- | --- |
| `/api/v1/ws/telemetry/{device_id}` | every new reading from one PC, as it arrives |
| `/api/v1/ws/alerts/{device_id}` | alerts for one PC as they open, change and close |
| `/api/v1/ws/alert-feed` | alerts for all of the user's PCs (the dashboard's pop-up and bell) |

## Agent protocol

| When | Call | Notes |
| --- | --- | --- |
| Linking | `POST /auth/login` then `POST /devices/register` | returns the device key |
| Every reading (5 s) | `POST /telemetry/ingest/batch` | up to 100 readings; each has an `event_id`, so resending is safe |
| Every 10 s | `GET /agent/fixes/next?agent_version=` | at most one fix; also records the agent's version |
| After a fix | `POST /agent/fixes/{id}/result` | `succeeded`, `failed` or `declined`, with undo data |
| A timed fix ends | `POST /agent/fixes/{id}/reverted` | |
| Every 15 s | `GET /agent/alerts/pending` | new critical alerts to show; each handed out once |
| Every 2 min | `GET /agent/location` | whether the owner wants the PC's location |
| On a move / change / 30 min | `POST /agent/location` | `ok` with a position, or `off`, `unavailable`, `no_user` (then the server estimates from the address) |

### Reading (abridged)

```json
{
  "event_id": "8f1c...",
  "timestamp": "2026-11-28T09:15:05Z",
  "sensor_id": "agent-1a2b3c4d",
  "cpu": {"core_temperature_c": 61.0, "utilization_percent": 23.5, "clock_speed_ghz": 3.1,
          "process_count": 212, "thread_count": 3120, "handle_count": 98000, "uptime_seconds": 86400},
  "gpu": {"core_temperature_c": 48.0, "utilization_percent": 5.0, "vram_used_gb": 1.2, "vram_total_gb": 8.0},
  "ram": {"usage_percent": 58.0, "used_gb": 9.3, "total_gb": 16.0, "committed_gb": 12.1,
          "commit_limit_gb": 24.0, "pagefile_usage_percent": 7.0, "whea_error_count": 0},
  "storage": [{"device_name": "C:", "total_capacity_gb": 476.3, "available_capacity_gb": 182.4}],
  "disk": {"active_percent": 3.0, "read_bytes_per_s": 120000, "write_bytes_per_s": 54000},
  "network": {"adapter_name": "Wi-Fi", "receive_bytes_per_s": 2400, "send_bytes_per_s": 900, "link_speed_mbps": 300},
  "processes": [{"name": "chrome.exe", "pid": 4242, "cpu_percent": 6.1, "memory_mb": 512}],
  "security": {"checked_at": "...", "antivirus": "Microsoft Defender", "realtime_protection": true,
               "definitions_age_days": 0, "quick_scan_age_days": 1, "threats": [], "suspicious_processes": []}
}
```
