# Security policy

Lectio handles people's account details, their PCs' hardware readings, antivirus
reports and, when they switch it on, their PCs' locations. Reports of security
problems are welcome and taken seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.**

- Email **[SECURITY CONTACT EMAIL]** with "Security" in the subject, or use
  GitHub's private reporting: *Security → Report a vulnerability* on
  https://github.com/wittns-ctrl/Telemetry_engine.
- Include what you found, how to reproduce it, and what an attacker could do
  with it. Screenshots or a short proof of concept help.
- Don't access, change or delete other people's data, and don't run tests that
  slow the service down for everyone.

What to expect:

| Step | Within |
| --- | --- |
| Acknowledgement of your report | 3 working days |
| First assessment and severity | 7 days |
| Fix for a critical or high issue | 30 days, sooner where possible |
| Credit in the changelog (if you want it) | when the fix ships |

## Supported versions

| Component | Supported |
| --- | --- |
| Website and API | the version currently deployed from `main` |
| Windows agent | the latest release on GitHub; older agents receive no fixes |

## What's in scope

- https://getlectio.vercel.app and its `/api/*` routes
- The API at https://telemetry-engine-w57g.onrender.com
- The Windows agent (`lectio-agent.exe`) from this repository's releases

Out of scope: third-party services Lectio uses (MongoDB Atlas, Upstash,
Render, Vercel, Google, SendLiberty, GitHub), social engineering, and
denial-of-service testing.

## How Lectio protects users

A summary; details are in [docs/security-assessment.md](docs/security-assessment.md)
and [docs/architecture.md](docs/architecture.md).

- HTTPS everywhere; HSTS; Content-Security-Policy, X-Frame-Options and other
  browser protections on every page.
- Passwords stored as Argon2 hashes. Access tokens live only in page memory;
  the refresh token is an HttpOnly, Secure cookie scoped to the sign-in paths.
- Rate limits on sign-in and every other endpoint, keyed on the visitor's real
  address behind Vercel and Cloudflare.
- Every route checks the requester owns the device, alert or fix; tests cover
  this for each kind of data.
- The agent only runs fixes from its own built-in catalogue, re-checks every
  parameter, asks at the PC before big ones, and builds its notification links
  itself, so a compromised server cannot make PCs run commands or open other
  sites.
- Location is off until the owner switches it on, visible only to them, and
  deleted when switched off.
- Production refuses to start with unsafe settings (weak secret key, missing
  email settings, non-HTTPS site address).
