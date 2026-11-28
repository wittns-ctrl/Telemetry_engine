# Contributing to Lectio

Thanks for helping. This guide covers setting up, making a change and getting
it merged. Security problems go through [SECURITY.md](SECURITY.md), not issues.

## Set up

Follow "Run it locally" in the [README](README.md). You'll need Python 3.14 with
uv, Node.js 20.19+, Go 1.27 for the agent, and a MongoDB you can use for
development (never the production database).

## Branches and commits

- `main` is what's deployed: Render (API) and Vercel (website) deploy every push.
- Work on a branch named for the change, such as `fix/agent-update-install` or
  `feature/battery-health`.
- Write commit subjects in the imperative, describing the effect for users:
  "Keep the sign-in cookie after a reload", not "update auth.py".
- One change per commit where practical; explain the why in the body.

## Before opening a pull request

```bash
uv run pytest -q
cd agent-go && go vet ./... && go test ./...
npm --prefix frontend run build
npx --prefix frontend oxlint frontend/src
```

All must pass. GitHub runs the backend tests on every pull request.

## What reviewers look for

- **Tenant isolation.** Every route that reads or changes a device, alert, fix
  or location checks the requester owns it. Add a test that another account
  can't reach it.
- **Agent safety.** The agent never runs anything the server sends except fixes
  from its own catalogue, with parameters re-checked on the PC. Big fixes ask
  at the PC. Links the agent opens are built on the PC.
- **New alert rules** need: a sourced threshold (update
  [docs/alert-thresholds.md](docs/alert-thresholds.md)), a fix in
  `app/core/fix_catalogue.py`, a diagnosis in
  `app/services/ai_diagnostic_service.py`, dashboard wording in
  `frontend/src/components/alertWords.js`, and, for critical rules, notification
  wording in `app/api/v1/agent_alerts.py`. Tests fail if any is missing.
- **Plain language.** Lectio is for non-technical people. UI text says what's
  wrong and what to do, without jargon.
- **UI changes** are shown as 3–4 options first and only the chosen one is built.
- **Privacy.** New personal data needs an entry in the privacy policy and a
  retention period.

## Releasing the agent

See [docs/agent-release.md](docs/agent-release.md).
