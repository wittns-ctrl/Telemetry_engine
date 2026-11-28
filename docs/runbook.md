# Runbook

What to do when something goes wrong. Start every investigation with:

```powershell
curl https://getlectio.vercel.app/api/v1/health
```

| Field | Healthy | If not |
| --- | --- | --- |
| HTTP status | 200 | see "The site says it can't reach the server" |
| `database` | `ok` | see "Database unreachable" |
| `shared_state` | `redis` | see "Redis unreachable" (the API still works) |
| response time | under ~3 s | over 30 s: Render was asleep (free plan) |

Logs: Render → service → **Logs**. Deploys: Render → **Events**, Vercel → **Deployments**.

## The site says "Couldn't reach Lectio's server"

1. Open the health URL above. A Render "waking up" page means the free
   instance was asleep: wait a minute and retry. Lasting fix: Starter plan.
2. A 5xx or timeout: check Render → Events for a failed deploy (roll back) and
   the log for the error.
3. Health is fine but the site still fails: in the browser's DevTools → Console,
   a CSP error means `frontend/vercel.json`'s `connect-src` lacks the API
   address; a CORS error means `FRONTEND_URL` on Render doesn't match the site.

## A deploy fails to start

The log line `Refusing to start: unsafe settings for APP_ENV=production` lists
each problem (weak `SECRET_KEY`, missing email settings, non-https
`FRONTEND_URL`). Fix the variables in Render → Environment; it redeploys. The
previous version keeps serving meanwhile.

## Database unreachable

`database` isn't `ok`, or the log shows `ServerSelectionTimeoutError` / SSL
handshake errors.

1. Atlas status page and your cluster's status (paused? over quota?).
2. Atlas → Network Access still allows Render (`0.0.0.0/0`).
3. The database user's password matches `MONGODB_URI` (after a rotation).
4. Free tier full (512 MB): lower `TELEMETRY_RETENTION_DAYS` or upgrade.

## Redis unreachable

Log: `Redis live-update relay failed, using this process's own state`.
The API keeps working on memory. Check `REDIS_URL` starts with `rediss://`,
the Upstash password, and Upstash's monthly command limit.

## Emails don't arrive

Log: `SendLiberty answered 401/403/429`.
- 401: `SENDLIBERTY_API_KEY` wrong or rotated.
- 403: `EMAIL_FROM` isn't the Gmail connected in SendLiberty.
- 429: daily limit (about 200 for a Gmail sender) reached; wait or upgrade.
Also check the user's spam folder.

## Users are signed out on every reload

Vercel's `VITE_API_BASE` must be the site's own address
(`https://getlectio.vercel.app`), not Render's. Redeploy after changing it.

## Google sign-in says "expired or was interrupted"

`GOOGLE_REDIRECT_URI` on Render and the redirect URI in Google Cloud Console
must both be `https://getlectio.vercel.app/api/v1/auth/google/callback`, and the
website must be built with that same `VITE_API_BASE`.

## A PC stopped reporting

On the PC (PowerShell as administrator):

```powershell
Get-Service LectioAgent
& "C:\Program Files\Lectio\lectio-agent.exe" status
Get-Content C:\ProgramData\Lectio\logs\agent.log -Tail 50
```

- `api` is `http://localhost:8000`: an old build; install the latest release.
- `last_error` 401: the device key was rejected (PC removed from the account):
  run `lectio-agent link`.
- Uploads fail with timeouts: the PC is offline or Render is asleep; readings
  wait in the buffer (up to 7 days) and arrive later.
- Service missing: reinstall by running the latest `lectio-agent.exe`.

## Alerts that shouldn't fire, or don't

Check the rule's threshold in [alert-thresholds.md](alert-thresholds.md) and the
reading on the dashboard. A rule whose reading the PC doesn't report stays
silent by design.

## Someone is guessing passwords

Many `429` responses on `/auth/login` in the log. The limit is working. If it
continues from many addresses, lower `RATE_LIMIT_AUTH_PER_MINUTE` and consider
Cloudflare rules in front of Render.

## Rotating a secret

See [secrets-register.md](secrets-register.md).
