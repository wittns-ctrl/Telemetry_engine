# Lectio agent for Windows

The Lectio agent is a small program that runs on your PC and sends its health
readings to your Lectio dashboard. You don't need Python or anything else
installed: it is one file, `lectio-agent.exe`.

## Get started

1. Download `lectio-agent.exe` from the link you were sent and save it
   somewhere permanent, e.g. a `Lectio` folder in Documents.
2. Double-click it. A black console window opens.
   - Windows may show **"Windows protected your PC"** (SmartScreen) because
     the program is new and not code-signed yet. Click **More info**, then
     **Run anyway**. Your antivirus may also scan it for a few seconds first.
3. The first time, it asks you to sign in with your Lectio email and password.
   Your password is only used to link this PC and is never saved. Then it asks
   which country the PC is in, for the dashboard map; press Enter to skip.
4. That's it. Leave the window open (you can minimise it) and your PC appears
   on the dashboard within a few seconds. Next time, double-clicking just
   starts sending again, with no sign-in.

## What it reads

Every 2 seconds: CPU and GPU usage, temperatures, clock speeds and fan speeds,
memory use, disk space and drive health, power readings, and Windows hardware
error counts (WHEA). It reads these from Windows (WMI, the event log and
system counters). It does **not** read your files, browsing, keystrokes or
screen.

It keeps one small file, `.telemetry_agent.json` in your user folder
(`C:\Users\<you>\`), holding this PC's device key and the undo notes for any
fixes it has made.

## Fixes from the website

When you pick a fix on the website (for example "Clear temporary files"), the
agent carries it out on this PC. Big fixes pop up a window asking you to
**Allow** first. To turn fixes off on this PC entirely, start it from a
terminal with:

```
lectio-agent.exe --no-fixes
```

## Stop it

Press **Ctrl+C** in its window, or just close the window. It does not start
with Windows on its own, so it stays stopped until you run it again.

## Other options

Run `lectio-agent.exe --help` in a terminal for all of them. Useful ones:

- `--reset`: sign in again and re-link this PC, e.g. to move it to another
  account. Add `--country "Rwanda"` to change its country.
- `--name "Office PC"`: the name shown on the dashboard (used when linking).
- `--once`: send one reading and exit, to check it works.

To remove the agent, close it, delete `lectio-agent.exe` and
`C:\Users\<you>\.telemetry_agent.json`, and delete the device on the website.

## For developers

Run from source with `uv sync --extra agent` then
`uv run python -m agent.telemetry_agent` (sends to `http://localhost:8000`).

Build the .exe on Windows; the URL you pass becomes the agent's default API:

```
uv sync --extra agent --group build
uv run python agent/build_exe.py --api https://api.your-lectio-host.com
```

This writes `dist/lectio-agent.exe` (about 25 MB). `TELEMETRY_API` or `--api`
still override the built-in URL. PyInstaller is in the `build` dependency
group, so the server install and `requirements.txt` never include it.
