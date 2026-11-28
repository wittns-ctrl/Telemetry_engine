# Incident response plan

For security incidents (a leak, a break-in, malicious use) and serious outages.
Everyday problems are in the [runbook](runbook.md).

## Roles

Lectio is run by a small team; one person may hold several roles.

| Role | Who | Does |
| --- | --- | --- |
| Incident lead | [NAME] | decides, coordinates, keeps the timeline |
| Technical lead | [NAME] | investigates, contains, fixes |
| Communications | [NAME] | tells users and, if required, the authorities |

Contact: [SECURITY CONTACT EMAIL] · [PHONE]

## Severity

| Level | Examples | Respond within |
| --- | --- | --- |
| **SEV 1** | personal data exposed; someone controls accounts, the server or agents; a secret leaked publicly | immediately |
| **SEV 2** | a vulnerability that could expose data, not yet exploited; the service down for everyone | 4 hours |
| **SEV 3** | a single account compromised; partial outage; a low-risk vulnerability | 1 working day |

## Steps

### 1. Detect and record
Write down when it was noticed, by whom, and what was seen. Keep a timeline
from here on; don't delete logs or data.

### 2. Contain
Pick what fits; speed matters more than tidiness.

| Threat | Action |
| --- | --- |
| A secret leaked | Rotate it now ([secrets-register.md](secrets-register.md)) |
| Sign-in tokens may be stolen | Rotate `SECRET_KEY` (signs everyone out) |
| One account taken over | Reset its password; delete its refresh tokens |
| A PC's device key stolen | Remove the PC from the account |
| The API is being abused | Lower rate limits; block addresses at Cloudflare; suspend the Render service if needed |
| Malicious agent release | Mark the previous release as Latest; delete the bad asset |

### 3. Investigate
Render logs, the `audit_logs` collection (sign-ins, password changes, fixes),
Atlas access logs, GitHub's security log. Establish what data, which users,
and since when.

### 4. Fix and recover
Fix the cause, deploy, restore data if needed ([backup-restore.md](backup-restore.md)),
and watch closely for a week.

### 5. Notify
- **Users affected by a personal-data breach:** without undue delay, in plain
  words: what happened, what data, what we've done, what they should do
  (for example change passwords).
- **Authorities:** many data-protection laws require notifying the regulator
  within **72 hours** of becoming aware of a breach that risks people's rights.
  Check the law that applies to you ([COUNTRY]) and the regulator's contact:
  [REGULATOR].
- Record every notification: who, when, what was said.

### 6. Learn
Within two weeks, write a short blameless review: timeline, cause, what
helped, what to change. Add the actions to the [roadmap](roadmap.md).

## User notification template

> **Subject:** Important: a security issue affecting your Lectio account
>
> On [date] we found that [what happened, in one sentence]. It may have
> exposed [which data] for [which accounts]. We have [what we did].
>
> **What you should do:** [for example: change your Lectio password, and any
> other account where you used the same password].
>
> We're sorry. If you have questions, reply to this email or contact
> [contact email].
