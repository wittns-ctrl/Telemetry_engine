# Lectio agent (Go)

A small Windows program that runs as a background service on a PC, reads its
health every few seconds and sends the readings to the Lectio API. It starts
with Windows (before anyone signs in), restarts itself if it stops, keeps
readings on disk while the PC is offline, and carries out fixes chosen on the
website, asking at the PC first for the big ones.

It replaces the Python agent in `../agent/` as the download on the website.

## For people using it

1. Download **lectio-agent.exe** from the website (My Devices → Connect a PC).
2. Double-click it and choose **Yes** when Windows asks for permission.
   If Windows says it protected your PC (the program isn't code-signed yet),
   choose **More info**, then **Run anyway**.
3. Sign in with your Lectio email and password. The password is used once to
   link the PC and is never saved.

That's all: the window can be closed. Lectio keeps running in the background.

Useful commands (in a terminal; most ask Windows for permission):

| Command | What it does |
|---|---|
| `lectio-agent status` | Is it running, when it last uploaded, readings waiting |
| `lectio-agent stop` / `start` | Stop or start the service |
| `lectio-agent link -name "Office PC" -country Rwanda` | Link the PC again (e.g. to another account) |
| `lectio-agent uninstall` | Remove the service (keeps settings and logs) |
| `lectio-agent uninstall -purge` | Remove it and delete settings, buffered readings and logs |
| `lectio-agent run` | Run in the window instead of as a service (for testing) |

**What it reads:** CPU use, clock speed and temperature (where Windows exposes
it), memory and pagefile, each drive's capacity, disk and network speed,
process/thread/handle counts, uptime, the busiest programs (name, CPU, memory,
disk), the graphics card (full readings on NVIDIA via `nvidia-smi`), and the
count of Windows hardware errors (WHEA). It never reads files, browsing,
keystrokes, the screen, command lines or window titles.

**What it can change:** only the fixes listed in
`internal/fixes/catalogue.go` (cool down, balanced power plan, clear old
temporary files, close an app, stop an app starting with Windows, restart one
of four Windows services, repair system files, check the drive). The website
can only pick one of those by name; the agent checks every parameter itself
and never runs commands sent by the server. Big fixes show a Yes/No box on
the screen first and count as "no" after 5 minutes. Set `fixes_enabled` to
`false` (or `LECTIO_FIXES=off`) to turn fixes off on a PC.

## Where things are

| Path | Contents |
|---|---|
| `C:\Program Files\Lectio\lectio-agent.exe` | The installed program |
| `C:\ProgramData\Lectio\agent.json` | Settings and the device key (encrypted with Windows DPAPI) |
| `C:\ProgramData\Lectio\buffer\` | Readings not yet accepted by the server |
| `C:\ProgramData\Lectio\state.json` | How to undo fixes, and timed fixes to end |
| `C:\ProgramData\Lectio\status.json` | Health, updated every 15 s (`lectio-agent status`) |
| `C:\ProgramData\Lectio\logs\agent.log` | JSON logs, rotated at 10 MB, 5 kept for 14 days |

`C:\ProgramData\Lectio` is readable only by SYSTEM and Administrators.

## Settings

In `agent.json`; environment variables override the file.

| Setting | Env variable | Default | Meaning |
|---|---|---|---|
| `api_url` | `LECTIO_API` | set at build time | Lectio API address; must be `https://` (plain `http://` only for localhost) |
| `interval_seconds` | `LECTIO_INTERVAL_SECONDS` | 5 | Seconds between readings (1–300) |
| `batch_size` | `LECTIO_BATCH_SIZE` | 12 | Most readings per upload (1–100) |
| `buffer_max_mb` | `LECTIO_BUFFER_MAX_MB` | 100 | Disk space for unsent readings; the oldest go first when full |
| `buffer_max_days` | | 7 | Unsent readings older than this are dropped |
| `fixes_enabled` | `LECTIO_FIXES` (`on`/`off`) | true | Take fixes from the website |
| `log_level` | `LECTIO_LOG_LEVEL` | info | debug, info, warn or error |
| `top_processes` | | 10 | Busiest programs sent with each reading (0–20) |
| | `LECTIO_DATA_DIR` | `C:\ProgramData\Lectio` | Data folder (for testing) |

Restart the service after changing settings (`lectio-agent stop`, then `start`).

## How it talks to the backend

Only through the existing FastAPI endpoints, over HTTPS with certificate
checks (TLS 1.2+). It has no database access.

| When | Request | Auth |
|---|---|---|
| Linking | `POST /api/v1/auth/login`, then `POST /api/v1/devices/register` | email + password, once |
| Every upload | `POST /api/v1/telemetry/ingest/batch` | `X-Device-Key` |
| Every 10 s or so | `GET /api/v1/agent/fixes/next` (also marks the agent as running) | `X-Device-Key` |
| After a fix | `POST /api/v1/agent/fixes/{id}/result` or `/reverted` | `X-Device-Key` |

Each reading gets a random event id. The server stores each id once per
device, so a batch resent after a timeout is never stored twice. Readings are
written to the disk buffer before any upload; a batch is deleted only once
the server answers 202. Network errors, 5xx and 429 answers are retried with
exponential backoff (2 s doubling to 5 minutes, with jitter). A 401 means the
PC was removed or re-linked elsewhere: uploads pause (readings are kept) until
it's linked again. Other 4xx answers mean the readings themselves were
refused; they're dropped and logged so they can't block the queue.

## For developers

### Install Go

Go 1.27 or newer: install from <https://go.dev/dl/> (or
`winget install GoLang.Go`), then check with `go version`.

### Build and test

```powershell
cd agent-go
go test ./...                                  # unit + this PC's real readings
.\build.ps1                                    # localhost:8000, for development
.\build.ps1 -Api https://api.your-lectio-host.com -Version 1.0.1
```

`build.ps1` runs the tests, builds `dist\lectio-agent.exe` with the API address
baked in, and copies it to `..\downloads\lectio-agent.exe`, which the API hands
out at `/api/v1/agent/download` straight away. Dependencies download on the
first build (`go mod download` to fetch them up front).

To try it against a local API without installing the service:

```powershell
$env:LECTIO_DATA_DIR = "$env:TEMP\lectio-test"
.\dist\lectio-agent.exe link -name "Test PC"
.\dist\lectio-agent.exe run
```

### Layout

```
cmd/lectio-agent      command line: setup, link, install, start, stop, status, run
internal/config       settings, data folder permissions, device key encryption
internal/logging      JSON logs with rotation
internal/collectors   readings (gopsutil, plus WMI / psapi / nvidia-smi on Windows)
internal/services     scheduler -> processor -> disk buffer -> uploader; health status
internal/storage      the on-disk buffer with size and age limits
internal/api          HTTPS client for the endpoints above
internal/retry        exponential backoff with jitter
internal/auth         linking the PC to an account
internal/fixes        fix catalogue, approval prompt, runners, undo records
internal/service      Windows Service install/run (Linux/macOS stubs to fill in)
internal/models       JSON shapes shared with the API
```

Windows-only code sits in `*_windows.go` files with `*_other.go` stand-ins, so
the agent also builds for Linux (`GOOS=linux go vet ./...`). Linux support
would add a systemd unit running `lectio-agent run` in `internal/service`, and
hwmon temperatures in `internal/collectors`.

## Troubleshooting

- **The PC doesn't appear on the dashboard.** Run `lectio-agent status`. If
  the service is stopped, `lectio-agent start`. If "Last problem" mentions a
  connection, check the PC's internet; readings are kept and sent later.
- **"the server rejected this PC's device key"** in the log: the PC was
  removed on the website or linked from elsewhere. Run `lectio-agent link`.
- **No temperature readings.** Many PCs don't expose a CPU temperature to
  Windows; the reading stays empty rather than guessed. GPU temperatures need
  an NVIDIA card.
- **"Windows protected your PC"** on download: the program isn't code-signed
  yet. Choose More info, then Run anyway.
- **Logs:** `C:\ProgramData\Lectio\logs\agent.log` (open an administrator
  terminal to read it).
