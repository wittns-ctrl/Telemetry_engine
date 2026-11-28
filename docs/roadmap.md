# Roadmap

Updated 28 November 2026.

## Done

- Windows agent as a service, offline buffer, safe fixes with undo (1.0.x)
- Plain-language dashboard, alerts window, email alerts, AI diagnosis
- 58 alert rules from sourced thresholds
- Windows notifications for critical alerts (1.1.0)
- Malware detection with Microsoft Defender, Security tab (1.1.0)
- Exact and approximate PC location on the map, opt-in (1.2.0)
- Security pass: headers, working sign-in rate limit, hidden API docs

## Now — before inviting real users

| Item | Why |
| --- | --- |
| Rotate the SendLiberty key and the Atlas password | both were exposed ([secrets-register.md](secrets-register.md)) |
| Fill in the legal pages' blanks | company, contact, hosting, governing law ([legal-checklist.md](legal-checklist.md)) |
| Choose and confirm the licence | the repository is public ([LICENSE](../LICENSE)) |
| Render Starter plan | no wake-up delays; background jobs keep running |
| Paid Atlas tier or daily export | there are no backups today ([backup-restore.md](backup-restore.md)) |
| Lower the reading/upload rate (read 10 s, upload 30 s) | fits Upstash's and Atlas's free limits per PC |
| Publish agent 1.2.0 under its own tag | the 1.1.0 release currently holds the 1.2.0 file |

## Next

| Item | Notes |
| --- | --- |
| Startup-program watch | alert on new unsigned programs set to start with Windows (malware layer 4) |
| Agent self-update | today users must run a new `.exe` |
| Code-sign the agent | removes the SmartScreen warning |
| Optional two-step sign-in | for account owners |
| Offline alerts on the PC | evaluate rules locally and notify while offline |
| Battery health for laptops | wear level, charger state |
| Disk latency and NVMe spare | better drive warnings |

## Later

- Shared accounts (family, small office) with roles
- Weekly health email
- Suspicious-behaviour detection (cryptominers, mass file changes)
- Monitoring and alerting on the service itself (uptime page)
- Independent security review before any paid plan
