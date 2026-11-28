# Changelog

All notable changes to Lectio. The website and API are deployed continuously
from `main`; the Windows agent is versioned and released on GitHub.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Agent 1.3.0 — 2026-11-28 (deploy the API first)

### Added
- **Activity log** page: sign-ins, alerts opened and closed, fixes, PCs linked
  or removed, agent updates and daily checks, grouped by day with filters.
  Entries expire automatically after 7 days.
- **Fix button** on every alert (pop-up, alerts window, My Devices, Activity):
  opens the alert with the suggested ways to solve it.
- **Daily check**: at 8 pm (or on the next start) the agent asks for the day's
  health report: a score out of 100, what was found and a numbered to-do list,
  with a Windows notification linking to it. Reports are kept 30 days.

### Changed
- AI advice now uses `gemini-3.1-flash-lite` (answers in 1–3 s) with
  `gemini-3-flash-preview` as a fallback; the retired model returned nothing.
- Storage: readings are stored in a MongoDB time-series collection (about 85%
  smaller), empty fields are no longer saved, and the agent gzip-compresses
  uploads of 1 KB or more (the API unpacks them, capped at 8 MB).

## Agent 1.2.0 — 2026-11-28 (with the API and website of the same day)

### Added
- **PC location on the map**, off until the owner switches it on per PC (My
  Devices), visible only to them. Exact position from Windows Location,
  re-checked every 2 minutes and sent when the PC moves more than about 100 m.
- **Approximate location** from the PC's internet address when Windows Location
  can't give one, looked up in DB-IP's database on Lectio's own server.
- Location history kept 30 days; switching off, deleting the PC or the account
  deletes it.
- Privacy policy covers location and the antivirus report.

## Agent 1.1.0 — 2026-11-27

### Added
- **Malware detection** with Microsoft Defender: protection status, definitions
  age, last scans and the threats found in the last 30 days; programs using
  Windows names from outside Windows' folders.
- 8 security alerts, a **Security tab** (design D), an "Is it safe?" summary
  question and a shield per PC on My Devices.
- Fixes: quick scan, update definitions, full scan, remove threats.
- **Windows notifications** on the PC for critical alerts, with an "Open
  dashboard" button that opens that alert's fixes and diagnosis.

### Changed
- **Alert rules rebuilt from reference thresholds**: 50 hardware rules (58 with
  security), each with sources ([docs/alert-thresholds.md](docs/alert-thresholds.md)).
- Hardware errors (WHEA) are counted over the last 24 hours, not all time.

### Security
- Content-Security-Policy and other security headers on the website.
- API documentation hidden in production.
- The sign-in rate limit now identifies visitors correctly behind Render and Vercel.

## Agent 1.0.3 — 2026-11-26

### Fixed
- Updating an installed agent failed with "Access is denied"; the service is now
  stopped before its program is replaced.
- A PC set up by an older build moves to the server its new agent was built for.

## Website and API — 2026-11-26

### Changed
- The website reaches the API through its own address (`/api/*` on Vercel), so
  the sign-in cookie is first-party and a reload keeps you signed in.
- Every page address loads the app (password-reset and verification links in
  emails returned 404 before).
- Email is sent through SendLiberty.
- Removed the unused "Continue with Apple" button.
- `APP_ENV` and `FRONTEND_URL` are read forgivingly (any case, trailing slash).

## Agent 1.0.2 — 2026-11-26

First public release, built for the live API.

## Earlier — 2026-11-12 to 2026-11-25

- Go agent running as a Windows service, with an offline buffer.
- Plain-language dashboard summary, alerts window with "How to fix", offline notice.
- Hourly and daily summaries; raw readings kept 7 days.
- Redis for shared state across API servers.
- Fixes chosen on the website and carried out by the agent, with fix levels and undo.
- Email codes at sign-up, hardened sign-in, account deletion.
- Production refuses to start with unsafe settings.
