# Releasing the Windows agent

The website's "Download for Windows" buttons point at GitHub's latest-release
link, `https://github.com/wittns-ctrl/Telemetry_engine/releases/latest/download/lectio-agent.exe`,
so a release is live the moment it's published as **Latest**.

## 1. Before building

- Merge the agent's changes to `main`, and deploy the API first if the agent
  uses new endpoints (agents call the API; the API must already understand them).
- Choose the version: `MAJOR.MINOR.PATCH`. New features raise MINOR (1.2.0),
  fixes raise PATCH (1.2.1).
- Add the release to [CHANGELOG.md](../CHANGELOG.md).

## 2. Build (on Windows)

```powershell
cd agent-go
.\build.ps1 -Api https://telemetry-engine-w57g.onrender.com -Version 1.2.0
```

The script runs every agent test first and refuses to build if one fails. It
bakes in the API address and the website address that notifications open
(`-Site`, default `https://getlectio.vercel.app`), then writes
`agent-go\dist\lectio-agent.exe`.

Check it:

```powershell
.\dist\lectio-agent.exe --version
(Get-FileHash .\dist\lectio-agent.exe -Algorithm SHA256).Hash.ToLower()
```

## 3. Test on a PC

1. Run the new `.exe` on a PC that has the previous version installed. It must
   update in place (no "Access is denied") and keep the PC linked.
2. `lectio-agent status` shows uploads succeeding and the right API address.
3. On the dashboard: readings arrive, the Security tab fills in, and — if you
   switched location on — the pin appears.
4. Optional: trigger a test notification with a critical alert.

## 4. Publish

1. https://github.com/wittns-ctrl/Telemetry_engine/releases/new
2. **Tag:** `agent-v1.2.0` → *Create new tag on publish*. Target `main`.
3. **Title:** `Lectio agent 1.2.0`.
4. **Notes:** what's new (from the changelog) and `SHA-256: <hash>`.
5. **Attach** `lectio-agent.exe` — the name must stay exactly `lectio-agent.exe`.
6. **Label:** *Latest* (never *Pre-release*: the download link skips those).
7. *Publish release* (not *Save draft*).

## 5. Check

```powershell
curl -sI https://github.com/wittns-ctrl/Telemetry_engine/releases/latest/download/lectio-agent.exe
```

The `location:` header must point at the new tag.

## Fixing a mistake

- **Wrong file:** edit the release, delete the asset, upload the right one
  (same name), update the SHA-256.
- **Bad release:** mark the previous release as *Latest*; the download link
  follows at once. Installed agents keep their version until someone runs a
  newer `.exe` (the agent does not update itself yet).

## Code signing (recommended)

Unsigned, the agent triggers Windows SmartScreen ("Windows protected your PC").
Signing needs a code-signing certificate (OV, or EV to build reputation at
once). With one, sign after building:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a .\dist\lectio-agent.exe
```
