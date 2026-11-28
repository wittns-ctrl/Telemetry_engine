# Backup and restore

## What needs protecting

| Data | Where | Can it be rebuilt? |
| --- | --- | --- |
| Accounts, devices, alerts, fixes, audit log | MongoDB Atlas | **No** — must be backed up |
| Hourly/daily summaries | MongoDB Atlas | Partly (raw readings only last 7 days) |
| Raw readings | MongoDB Atlas | No, but they expire after 7 days anyway |
| Location history | MongoDB Atlas | No; expires after 30 days by design |
| Redis contents | Upstash | Yes — caches and counters, rebuilt automatically |
| Code, documents | GitHub | Yes — every clone is a copy |
| Agent releases | GitHub Releases | Yes — rebuild from the tag |
| Secrets | Render env | Re-create from each service (see [secrets-register.md](secrets-register.md)) |

## Current state

The Atlas free tier (M0) has **no automatic backups**. Until it changes, a
mistake or an attack could lose data for good.

## Plan

**Option A — paid Atlas tier (recommended).** An M10 or larger cluster has
continuous cloud backups with point-in-time restore. Set:
- snapshot every 6 hours, keep daily snapshots 7 days, weekly 4 weeks, monthly 12 months;
- point-in-time restore window: 2 days.

**Option B — scheduled export (while on the free tier).** Once a day:

```bash
mongodump --uri "$MONGODB_URI" --db "$MONGO_DB" \
  --excludeCollection telemetry_snapshots --gzip --archive=lectio-$(date +%F).gz
```

Store the archive encrypted, outside Atlas (for example a private cloud bucket
with a 30-day lifecycle). Raw readings are skipped: they're large and expire
anyway. Run it from a scheduled job (GitHub Actions with the URI as a secret,
or a small cron service).

## Restore

1. **Decide the point in time** to go back to and tell users if data since then
   will be lost.
2. **Restore into a new cluster or database first**, never straight over production:
   - Atlas backups: Backup → snapshot → *Restore* → to a new cluster.
   - Archive: `mongorestore --uri "<new cluster URI>" --gzip --archive=lectio-YYYY-MM-DD.gz`
3. **Check** the restored data: user count, a known account's devices and alerts.
4. **Switch** Render's `MONGODB_URI` (or `MONGO_DB`) to the restored database;
   Render redeploys and the API migrates indexes on start.
5. **Verify** with the health check and a sign-in.
6. Agents reconnect by themselves; readings they buffered while the API was
   down arrive within minutes.

## Test it

Restore the latest backup into a scratch database **every quarter** and record
the result here:

| Date | Backup used | Restored to | Time taken | Result |
| --- | --- | --- | --- | --- |
| [DATE] | | | | |
