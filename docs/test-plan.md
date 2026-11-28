# Test plan

## Automated tests

| Suite | Run | Covers | Count (Nov 2026) |
| --- | --- | --- | --- |
| Backend | `uv run pytest -q` | sign-in, tokens, email codes, Google; tenant isolation; ingest and batches; all alert rules and the engine; notifications; diagnosis; fixes and safety; rate limits behind proxies; security; location; retention and rollups; startup checks | 632 passed, 10 Redis tests skipped without a test Redis |
| Redis | `LECTIO_TEST_REDIS_URL=redis://… uv run pytest tests/test_shared_redis.py` | shared rate limits, caches, live relay | 10 |
| Agent | `cd agent-go && go test ./...` | collectors (incl. Defender and Windows Location on a real PC), buffer, uploader, fixes, notifications, location | all packages |
| Frontend | `npm --prefix frontend run build` and `npx oxlint` | compiles; lint | — |
| CI | GitHub Actions `tests.yml` | backend suite on every push and pull request | — |

Rules: a bug fix comes with a test that fails without it; any route touching a
user's data has an isolation test.

## Manual release checklist

Run before publishing an agent release or after a large server change.

### Website
- [ ] Landing page loads; "Download for Windows" downloads the latest `lectio-agent.exe`
- [ ] Sign up with email: code arrives, account created
- [ ] Sign in with Google
- [ ] Reload the dashboard: still signed in
- [ ] Forgot password: email arrives; the link opens the reset page (no 404)
- [ ] Privacy and Terms pages load and have no blanks
- [ ] No errors in the browser console (CSP, CORS)

### Agent
- [ ] Fresh install on a clean PC: links, service running, readings within a minute
- [ ] Update over the previous version: no "Access is denied", stays linked
- [ ] Unplug the network for 10 minutes: readings arrive afterwards, in order
- [ ] `lectio-agent status` shows the live API and successful uploads

### Alerts and fixes
- [ ] Load the CPU (or lower a threshold on a test server): alert opens after its duration, email arrives, pop-up and bell show it
- [ ] Critical alert: Windows notification on the PC; **Open dashboard** opens that alert
- [ ] Ask for a diagnosis; run "Switch to the Balanced power plan"; undo it
- [ ] A big fix shows the Yes/No box on the PC; "No" is reported as declined

### Security
- [ ] Security tab shows Defender's status and threat history
- [ ] Quick scan from the dashboard completes and is reported
- [ ] (Test PC) Turn off real-time protection: critical alert; turn on: it closes

### Location
- [ ] Switch on: exact pin within ~3 minutes
- [ ] Windows Location off: approximate pin with "approx." and the DB-IP credit
- [ ] Switch off: pin and history gone

### Accounts and data
- [ ] A second account can't see the first account's PCs, alerts or location
- [ ] Remove a PC: its data is gone; delete the account: everything is gone

## Performance

Before raising the number of PCs per API process, simulate many PCs uploading
against a staging API (a load-test script is still to be written).
