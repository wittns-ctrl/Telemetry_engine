# Secrets register

Every secret Lectio uses: what it is, where it lives, and how to replace it.
**This file lists names only. Never write a secret's value here or anywhere in
the repository.**

| Secret | Used for | Lives in | Owner's console | Last rotated | Next due |
| --- | --- | --- | --- | --- | --- |
| `SECRET_KEY` | signs sign-in tokens | Render env; local `.env` | — (generate) | [DATE] | yearly, or on any leak |
| `MONGODB_URI` password | database access | Render env; local `.env` | MongoDB Atlas → Database Access | [DATE] | **now: exposed in a test log, 27 Nov 2026** |
| `SENDLIBERTY_API_KEY` | sending email | Render env; local `.env` | sendliberty.com → API keys | [DATE] | **now: exposed in tool output, 26 Nov 2026** |
| `GEMINI_API_KEY` | AI diagnosis | Render env; local `.env` | Google AI Studio | [DATE] | yearly |
| `GOOGLE_CLIENT_SECRET` | Google sign-in | Render env; local `.env` | Google Cloud Console → Credentials | [DATE] | yearly |
| `REDIS_URL` password | shared state | Render env; local `.env` | Upstash → database → Reset password | [DATE] | yearly |
| Device keys | each PC's agent | hashed in MongoDB; DPAPI-encrypted on the PC | — | per PC | on removing a PC |
| GitHub account | code, releases | — | github.com → Settings → Password and authentication | — | use 2FA |
| Render, Vercel, Atlas, Upstash, SendLiberty, Google accounts | hosting and services | — | each service | — | use 2FA on every one |

## How to rotate

General order: create the new secret → put it on Render (and in local `.env`)
→ let Render redeploy → check `/api/v1/health` → revoke the old secret.

**`SECRET_KEY`.** Generate a new one and set it on Render. Everyone is signed
out (old tokens no longer verify) and simply signs in again.

```powershell
uv run python -c "import secrets; print(secrets.token_urlsafe(64))"
```

**MongoDB password.** Atlas → Database Access → the user → *Edit* → *Edit
Password* → autogenerate → update the password inside `MONGODB_URI` on Render.
The old password stops working immediately, so update Render straight away.

**SendLiberty key.** Create a new key, set `SENDLIBERTY_API_KEY` on Render,
send a password reset to yourself to test, then delete the old key.

**Gemini, Google client secret.** Create the new one in the console, update
Render, test (a diagnosis; a Google sign-in), then delete the old one.

**Upstash.** Reset the password, update `REDIS_URL` on Render, check
`"shared_state": "redis"` in the health check.

**A PC's device key.** Delete the PC on My Devices (or remove it from the
account); the key stops working at once. To relink: `lectio-agent link`.

## Rules

- Secrets go in Render's environment and local `.env` only. `.env` is ignored
  by git; `.env.example` holds names, never values.
- Don't paste secrets into chats, tickets, screenshots or logs. If one is
  exposed, rotate it the same day and note it in this table.
- GitGuardian scans every pull request for committed secrets.
