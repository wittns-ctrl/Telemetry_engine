# Legal pages: what to complete

The Privacy and Terms pages read their business details from
`frontend/src/siteInfo.js`. Anything left `null` shows as a highlighted
placeholder on the live site. Fill these in, then redeploy:

| Field | What to put | Example |
| --- | --- | --- |
| `company` | who runs Lectio | your company name, or your own name |
| `contactEmail` | where users and regulators reach you | a support address you check |
| `hosting` | where the data lives | `MongoDB Atlas (<region>), Render, Upstash` |
| `emailProvider` | who sends emails | `SendLiberty (via Gmail)` |
| `logRetention` | how long security logs are kept | `12 months` |
| `governingLaw` | whose law governs the terms | your country |
| `lastUpdated` | date of the latest change | update on every edit |

Also complete: the `[OWNER NAME]` in `LICENSE`, `[SECURITY CONTACT EMAIL]` in
`SECURITY.md`, and the names and contacts in `docs/incident-response.md`.

Have a lawyer in your country review the pages before real users rely on them,
especially because Lectio handles location and security data.
