# Architecture and contribution map

## A small stack with explicit boundaries

The browser requests JSON from a Node HTTP server. Public comparison data and editorial data have separate endpoints. SQLite owns persistence; TypeScript describes browser payloads. Native browser controls handle forms, navigation, and dialogs. CSS Grid owns page layout, and a semantic table owns the desktop comparison. On narrow screens, each topic stacks both candidates with explicit names.

Cloudflare Pages is an alternative runtime: `functions/api/[[path]].js` dispatches requests to `cloudflare/api.js`, backed by async D1 queries and atomic `batch()` writes in `cloudflare/repository.js`. The portable domain validator and CSV parser are shared with Node. D1 migrations replace the Node SQLite URL function with built-in SQL shape/review constraints. Pages credentials live in encrypted Cloudflare secrets; Web Crypto HMAC checks credentials and versions sessions, and D1 persists token hashes. Node retains scrypt-backed local credentials. See [the Pages guide](cloudflare-pages.md) for deployment and platform differences.

The Workers dashboard uses a separate entry point, `cloudflare/worker.js`, and `wrangler.worker.jsonc`. It routes API requests to that same Cloudflare API and serves the frontend through an ASSETS binding. Use `npm run deploy` to select this configuration explicitly; plain `wrangler deploy` would read the Pages configuration. No separate API service is needed. See [the Workers guide](cloudflare-workers.md).

The visual direction is editorial: warm paper surfaces, forest-green navigation, Georgia headings, and a system sans-serif for controls. Party accents identify columns without rating either candidate. Real candidate claims and images are not used as decorative placeholders. Motion is limited to native state changes; reduced motion retains all information and actions.

## Follow one statement through the app

1. A signed-in contributor submits a draft through `client/editorial.ts` or imports CSV.
2. `server/app.js` checks request size, content type, origin, session, and route permissions.
3. `server/domain.js` validates the draft's shape, date, source type, and any supplied URL. Drafts may lack a source while research continues.
4. `server/repository.js` inserts a draft and audit event in one transaction. CSV batches use one transaction for the entire batch.
5. A reviewer other than the author opens the source and checks the wording. The client sends the selected review action and explicit source-read confirmation.
6. The domain validator checks the reviewer role, separate identity, source URL, and confirmation. The SQL constraint independently enforces the source URL, separate identity, and confirmation. `database.js` registers the URL validation function SQLite uses in that constraint.
7. The repository updates review state and records an audit event in one transaction.
8. `/api/comparison` selects verified records and only public metadata. `client/comparison.ts` also refuses to render unverified records or unsafe source links.

The source-read checkbox records human attestation; software cannot prove a person actually read a page. Real researchers and reviewers must be assigned separately.

## State and content ownership

The database owns statement, session, review-task, and audit state. Page-local variables own filters. Navigation reloads the current record. Server errors preserve form values and show an error at the form. The app does not optimistically publish statements.

`client/ui.ts` escapes data interpolated into HTML and validates link protocols. Do not insert untrusted values into raw HTML or inline event handlers. The content security policy disallows inline scripts and external resources.

Records are append-oriented in this MVP. There is no in-place statement editor or delete action. For a content correction, create a corrected sourced draft, verify it independently, and flag the superseded statement. Audit history retains both. If an edit feature is added, require renewed review when statement text or source changes.

## Source health is a separate process

`link-health.js` checks verified source links on a 24-hour process timer or through the CLI. This is availability monitoring, not content verification. A failed check sets `link_status=unavailable` and creates an open `broken_link` task without changing `review_status`. Repeated failures deduplicate the task. Recovery resolves open broken-link tasks. Human corrections create separate tasks and do not automatically change a candidate's words.

Requests reject private and reserved IPv4 ranges, literal IP hosts, nonstandard ports, and destinations without public DNS. The checker pins a validated address to the connection and rechecks redirects. HEAD falls back to GET when explicitly unsupported; bodies are discarded. IPv6-only sources, bot protections, and timeouts can produce false failures and need human inspection.

The timer runs only while the process is alive; it is not a durable scheduler. For unattended production checks, use a persistent scheduler invoking `npm run links:check` against the same database. Keep one scheduler owner when scaling.

On Pages, optionally deploy the separate `cloudflare/scheduler.js` Worker with its production D1 binding. It checks five oldest records per hourly run and does not depend on a live Node process. The Pages API has shared D1-backed login/correction limits rather than an isolate-local counter. The static Pages output includes security headers and route rewrites; API responses set their own no-store and security headers.

## Authentication and deployment boundaries

Passwords come from ignored environment configuration. Stored passwords use salted scrypt hashes. Sessions use random tokens; SQLite stores only SHA-256 token hashes and eight-hour expirations. Cookies are HttpOnly and SameSite=Strict, with Secure configurable for HTTPS. Logout deletes the session. Password changes revoke sessions on restart.

Exact origin checks and JSON-only writes protect mutations from cross-site requests. Parameterized SQL prevents data from becoming executable SQL. The server only serves files beneath `public/`; database files, configuration, and test fixtures are outside that root.

Rate limits use the direct connection's address and live in one process. The app does not trust arbitrary forwarded-IP headers. A reverse proxy needs a trusted edge limiter; multiple instances need shared rate limits and an appropriate persistence plan. Authentication has no MFA, password recovery, invitations, or per-person account management yet.

## Adding a feature without obscuring the rules

- Add input rules in `domain.js`, persistence and audits in `repository.js`, then wire the endpoint and UI.
- For schema changes, add a numbered SQL migration. The runner applies filenames in sorted order and tracks them in the `migrations` table.
- Put payload changes in `client/models.ts` and update the endpoint and UI together.
- For a new topic, update the seed list with a stable ID and identical display treatment for both candidates. Existing seeds use `INSERT OR IGNORE`; changing their text in source does not overwrite existing database rows.
- For more races, add race-aware queries and routing. The schema supports multiple races, but the current API and pages target the single MVP comparison.
- Test the rule at its real boundary. Publication, permission, and rollback checks are more useful than tests that repeat internal code.

## Verification scope

Domain and HTTP tests use fresh in-memory databases. Browser tests run a separate in-memory server, exercise focus and recovery, capture desktop/mobile screenshots, check overflow, walk through review and corrections, and run automated WCAG AA rules with axe. Test code and fictional fixtures are outside the public build.

Automated accessibility checks do not replace screen-reader and real-user testing. No live candidate sources have been researched, and no production deployment has been performed. Outstanding launch work is listed separately.
