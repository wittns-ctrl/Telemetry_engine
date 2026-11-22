# Lectio

Free PC health monitoring for Windows. A small agent on each PC sends its
hardware readings every 2 seconds; Lectio stores them, raises an alert when
something stays over a safe limit (a hot CPU, a weak power supply, a failing
drive), emails the owner, explains the likely cause, and can carry out a fix on
the PC once the owner allows it.

```
PC: agent ──readings every 2 s──▶ API (FastAPI) ──▶ MongoDB
                                    │  anomaly rules → alerts → email / webhook
                                    │  AI or rule-based diagnosis, fixes
browser: React app ◀──REST + live WebSocket──┘
```

## Repository layout

| Path | What it is |
| --- | --- |
| `app/` | The API: FastAPI with Beanie on MongoDB. Routes in `app/api/v1/`, anomaly rules in `app/core/anomaly_rules.py`, the fix catalogue in `app/core/fix_catalogue.py`. |
| `agent/` | The Windows agent: reads hardware through WMI, pywin32 and psutil, sends snapshots, runs fixes. Tester instructions in [`agent/README.md`](agent/README.md). |
| `frontend/` | The website and signed-in app: React and Vite. |
| `tests/` | Backend tests (pytest). They use an in-memory database and never connect to a real MongoDB. |
| `Dockerfile`, `docker-compose.yml` | Container build for the API, and a compose file that runs it with MongoDB. |
| `.github/workflows/tests.yml` | Runs the backend tests on every push to `main` and every pull request. |

## Run it locally

You need Python 3.14 with [uv](https://docs.astral.sh/uv/), Node.js 20.19+ or
22.12+, and MongoDB (local, Docker or Atlas).

**API**

```bash
cp .env.example .env
```

Set at least `MONGODB_URI`, `MONGO_DB` and `SECRET_KEY` in `.env` (generate a
key with `python -c "import secrets; print(secrets.token_urlsafe(48))"`). Then:

```bash
uv sync
```

```bash
uv run uvicorn app.main:app --reload --port 8000
```

API docs are at http://localhost:8000/docs.

**Frontend**

```bash
npm --prefix frontend install
```

```bash
npm --prefix frontend run dev
```

Open http://localhost:5173 and create an account. The API only accepts
requests from `FRONTEND_URL` (default `http://localhost:5173`).

**Agent (on a Windows PC)**

```bash
uv sync --extra agent
```

```bash
uv run python -m agent.telemetry_agent --api http://localhost:8000
```

It asks you to sign in once, registers the PC, then sends readings. Add
`--no-fixes` to stop it carrying out fixes. To give testers a single
`lectio-agent.exe` instead, see [`agent/README.md`](agent/README.md#for-developers).

## Tests

```bash
uv run pytest -q
```

The suite covers auth, tenant isolation (no user can see another's devices,
readings, alerts or fixes), ingestion, anomaly rules, alerts and emails, AI
diagnosis, fixes and their safety rules, rate limiting and retention. CI runs it
on Linux, so Windows-only code must stay mockable: tests patch
`app.services.sensor_service._wmi_client` rather than importing `wmi`.

Frontend checks:

```bash
npm --prefix frontend run lint
```

```bash
npm --prefix frontend run build
```

## Configuration

Every API setting is listed with comments in [`.env.example`](.env.example).
The ones that matter in production:

| Setting | Why |
| --- | --- |
| `SECRET_KEY` | Signs sign-in tokens. Long and random; never reuse the example. |
| `MONGODB_URI`, `MONGO_DB` | The database. |
| `FRONTEND_URL` | The site's address; the API rejects browser requests from anywhere else. |
| `SMTP_*` | Verification, password-reset and alert emails. Without it, none are sent. |
| `GEMINI_API_KEY` | Optional. Google Gemini for diagnoses and fix advice; without it, both use the built-in rules. |
| `TELEMETRY_RETENTION_DAYS` | How long readings are kept (default 30). MongoDB deletes older ones itself. |
| `RATE_LIMIT_*` | Requests per minute for sign-in, agent uploads, fixes and everything else. |

The frontend reads its API address at build time: see
[`frontend/.env.example`](frontend/.env.example).

## Deploy

```bash
docker compose up --build
```

runs the API with its own MongoDB on port 8000, reading settings from `.env`.
To use a hosted database instead, drop the `mongo` service and the two
`MONGODB_URI` / `MONGO_DB` lines from `docker-compose.yml`.

- Serve the API over HTTPS. Behind a reverse proxy, set `FORWARDED_ALLOW_IPS`
  to the proxy's address so rate limits see each visitor's IP.
- The image runs one worker on purpose: rate-limit counters live in process
  memory, so more workers would each allow the full limit. Move them to a
  shared store such as Redis before scaling out.
- Build the frontend with `VITE_API_BASE` set to the API's public address and
  serve `frontend/dist/` as a static site.
- Publish the Windows agent: build it on Windows with the production API URL
  (`uv run python agent/build_exe.py --api https://your-api`), which copies it
  to `downloads/lectio-agent.exe`. The API serves that file at
  `/api/v1/agent/download`, and the site's "Download for Windows" buttons
  appear once it is there. With Docker, `downloads/` is baked into the image
  (and mounted by `docker-compose.yml`); elsewhere, set `AGENT_DOWNLOAD_PATH`.

## Known limits

- Many readings (temperatures, fan speeds, drive health) depend on what the PC
  exposes. Some laptops report no CPU temperature through Windows, and drive
  health needs `smartctl`; those readings show as "No reading".
- `lectio-agent.exe` is not code-signed yet, so Windows SmartScreen warns on
  first run.
- The agent does not start with Windows on its own.
