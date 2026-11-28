# Deployment

| Piece | Service | Address | Deploys |
| --- | --- | --- | --- |
| Website | Vercel, project `telemetry-engine`, root `frontend/` | https://getlectio.vercel.app | every push to `main` |
| API | Render web service (Docker), behind Cloudflare | https://telemetry-engine-w57g.onrender.com | every push to `main` |
| Database | MongoDB Atlas | from `MONGODB_URI` | managed |
| Redis | Upstash | from `REDIS_URL` | managed |
| Email | SendLiberty, sending from a connected Gmail | — | managed |
| Agent | GitHub Releases | `…/releases/latest/download/lectio-agent.exe` | by hand, see [agent-release.md](agent-release.md) |

GitHub Actions runs the backend tests on every push and pull request; a failing
run doesn't block Render or Vercel, so check it before merging.

## API on Render

**Service settings**

| Setting | Value |
| --- | --- |
| Runtime | Docker |
| Root directory | *(empty: repository root)* |
| Dockerfile path | `./Dockerfile` |
| Health check path | `/api/v1/health` |
| Instance | Starter or above for real users (the free plan sleeps after 15 minutes) |

The image installs the server dependencies with the Redis extra, downloads the
DB-IP location database (a failed download only disables estimates), copies
`app/`, and runs one uvicorn process on port 8000.

**Environment variables** (set in Render → Environment; never commit them)

| Variable | Required | Value / notes |
| --- | --- | --- |
| `APP_ENV` | yes | `production` — secure cookies, hidden API docs, startup safety checks |
| `MONGODB_URI`, `MONGO_DB` | yes | Atlas connection string and database name |
| `SECRET_KEY` | yes | ≥ 64 random characters: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `FRONTEND_URL` | yes | `https://getlectio.vercel.app` (CORS and links in emails) |
| `SENDLIBERTY_API_KEY`, `EMAIL_FROM` | yes | `EMAIL_FROM` must be the Gmail connected in SendLiberty, e.g. `Lectio <alerts@gmail.com>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | for Google sign-in | `https://getlectio.vercel.app/api/v1/auth/google/callback` (also in Google Cloud Console) |
| `GEMINI_API_KEY` | optional | AI diagnosis; without it, built-in rules |
| `REDIS_URL` | optional | Upstash `rediss://default:<password>@<host>:6379` (note `rediss`) |
| `ALERT_EMAILS_ENABLED`, `ALERT_EMAIL_MIN_SEVERITY`, `ALERT_EMAIL_COOLDOWN_MINUTES` | optional | defaults `true`, `WARNING`, `30` |
| `TELEMETRY_RETENTION_DAYS` | optional | raw readings, default `7` |
| `RATE_LIMIT_*` | optional | see `.env.example` |
| `IP_LOCATION_DB` | no | default matches the image (`data/dbip-city-lite.mmdb`) |

Not needed on Render: `FORWARDED_ALLOW_IPS` (visitor addresses come from
Cloudflare and Vercel headers; this is switched on automatically when Render
sets `RENDER=true`), `AGENT_DOWNLOAD_PATH` (downloads come from GitHub).

**Startup checks.** With `APP_ENV=production`, the API refuses to start if the
secret key is weak, email isn't configured, or `FRONTEND_URL` isn't https; the
log lists each problem. The previous version keeps running until a deploy succeeds.

**Healthy deploy log:** `IP location database YYYY-MM: N MB` (build),
`Application startup complete`, `Your service is live`.

## Website on Vercel

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework | Vite |
| `VITE_API_BASE` | `https://getlectio.vercel.app` (the site's own address: `/api/*` is proxied) |
| `VITE_WS_ORIGIN` | `wss://telemetry-engine-w57g.onrender.com` (Vercel can't proxy WebSockets) |
| `VITE_AGENT_DOWNLOAD_URL` | `https://github.com/wittns-ctrl/Telemetry_engine/releases/latest/download/lectio-agent.exe` |

`frontend/vercel.json` holds the `/api/*` proxy to Render, the fallback that
serves the app for every page address, and the security headers. If the API's
address changes, update the proxy destination and the CSP's `connect-src` there.

After changing a `VITE_*` variable, redeploy: they are read at build time.

## MongoDB Atlas

- **Network Access:** Render has no fixed outgoing address on its standard
  plans, so `0.0.0.0/0` is needed; the database user's strong password is the
  protection. Add your own address to reach the database from your PC.
- **Tier:** the free M0 tier has 512 MB and **no backups**. Move to a paid tier
  before real users depend on it (see [backup-restore.md](backup-restore.md)).
- Indexes are created and migrated by the API on start (`app/db/session.py`).

## Upstash Redis

Create a Redis database in the region closest to the Render service (Cape Town
and Frankfurt are far apart). Copy the TCP URL (not the REST URL) into
`REDIS_URL`. `/api/v1/health` reports `"shared_state": "redis"` when connected.

## Google sign-in

In Google Cloud Console → APIs & Services → Credentials → the OAuth client:
- Authorized JavaScript origins: `https://getlectio.vercel.app`
- Authorized redirect URIs: `https://getlectio.vercel.app/api/v1/auth/google/callback`
  (and `http://localhost:8000/api/v1/auth/google/callback` for development)

## Checking a deploy

```powershell
curl https://getlectio.vercel.app/api/v1/health
```

Expect `"status":"healthy"`, `"database":"ok"`, `"shared_state":"redis"`. Then
open the site, sign in, reload the dashboard (you should stay signed in) and
open a password-reset link (it should load the page, not 404).

## Rolling back

- **API:** Render → the service → Events → pick the last good deploy → *Rollback*.
- **Website:** Vercel → Deployments → the last good one → *Promote to Production*.
- **Agent:** mark the previous GitHub release as **Latest** (the download link follows it).
