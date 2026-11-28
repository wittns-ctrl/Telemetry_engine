# Security assessment

**Date:** 27–28 November 2026 · **Scope:** website, API, Windows agent ·
**Method:** external checks against the live service plus code review.
**Overall:** about **80%** (from about 65% before the fixes below). Not an
independent penetration test.

## Results by area

| Area | Score | Findings |
| --- | --- | --- |
| Encryption in transit | 95% | HTTPS everywhere, HTTP→HTTPS redirect, HSTS (2 years, preload) |
| Sign-in and sessions | 85% | Argon2 passwords; access token in memory only; refresh cookie HttpOnly, Secure, path-scoped, rotated; Google sign-in state check; rate limit verified live. **Missing:** two-step sign-in |
| Browser protections | 85% | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. CSP allows inline styles (needed by the app) |
| API exposure | 85% | Docs hidden in production; short error messages; CORS to the site only. The public health check shows connection counts |
| Tenant isolation | 80% | Every route filters by owner; tests cover devices, readings, alerts, fixes, location. Not every endpoint reviewed by hand |
| Agent | 70% | Fixes only from its own catalogue, parameters re-checked, Yes/No on the PC for big ones, links built locally, device key DPAPI-encrypted. **But:** not code-signed; runs as LocalSystem |
| Secrets | **50%** | SendLiberty key and part of the Atlas password were exposed during development; **not yet rotated** |
| Backups | **50%** | Atlas free tier: no backups |
| Monitoring | 60% | Audit log of sign-ins and fixes; no alerting on attacks |
| Privacy | 85% | Location opt-in, owner-only, deleted on switch-off, IP lookups local; retention limits |

## Fixed during the assessment

| Issue | Severity | Fix |
| --- | --- | --- |
| Sign-in rate limit ineffective behind Render (each attempt looked like a new visitor) | High | Visitor address from Vercel/Cloudflare headers, plus a limit on the connecting address |
| No browser security headers | Medium | CSP and others in `vercel.json` |
| API documentation public | Low | Hidden when `APP_ENV=production` |
| `APP_ENV` not production on Render (cookies not Secure, sign-up codes logged) | High | Set to production; value now read case-insensitively |
| Sign-in cookie dropped as third-party (reload signed users out) | Medium | `/api/*` proxied through the site |
| Updating the agent failed, leaving old agents running | Medium | Service stopped before replacement (1.0.3) |

## Open items

| # | Item | Severity | Owner | Due |
| --- | --- | --- | --- | --- |
| 1 | Rotate SendLiberty key and Atlas password | High | [NAME] | now |
| 2 | Backups (paid Atlas or daily export) | High | [NAME] | before real users |
| 3 | Code-sign the agent | Medium | [NAME] | next quarter |
| 4 | Optional two-step sign-in | Medium | [NAME] | next quarter |
| 5 | Alerting on unusual sign-in failures | Low | [NAME] | later |
| 6 | Trim the public health check | Low | [NAME] | later |
| 7 | Independent penetration test | Medium | [NAME] | before any paid plan |

## Not covered

Denial-of-service resistance, the Google OAuth flow under attack, the agent
against a local administrator on the same PC, third-party services' own security.
