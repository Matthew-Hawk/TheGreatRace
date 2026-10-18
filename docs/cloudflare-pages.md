# Deploy to Cloudflare Pages

The repository supports **Pages static assets + Pages Functions + D1**. You do not run `npm start` on Pages: the Node HTTP server and file-backed SQLite database are for local development. The Pages adapter lives in `functions/` and `cloudflare/`, uses the same frontend, validation rules, and CSV parser, and persists through the `DB` binding.

The app is prepared for deployment, but no Cloudflare account resources have been created or published by this change. Database IDs in the configuration are explicit placeholders.

**If your deployment log runs `npx wrangler deploy` after the build, you created a Workers project.** Use [the Workers guide](cloudflare-workers.md) for that existing project, or create an actual Pages project to follow this guide. No separate API repository is required for either host.

## 1. Create and initialize D1

Install dependencies and sign into your own Cloudflare account:

```sh
npm ci --ignore-scripts
npx wrangler login
npx wrangler d1 create the-great-race
npx wrangler d1 create the-great-race-preview
```

Replace the production placeholder `database_id` in `wrangler.jsonc` with the first command's returned ID. Replace the `env.preview.d1_databases` ID with the preview database's ID. In `wrangler.scheduler.jsonc`, use the same production ID as the main configuration. Database IDs are identifiers, not secrets, and can be committed.

Keep preview and production databases separate. The checked-in configuration overrides the preview binding explicitly; production data must not be writable from branch previews. Wrangler configuration is the source of truth for these bindings. See [Cloudflare's Pages configuration guide](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

Validate the IDs, then apply migrations before opening the app:

```sh
npm run pages:check-config
npm run pages:migrate:remote
npx wrangler d1 migrations apply DB --remote --env preview
```

The first two migrations create the schema, two contributor identities, the proposed race, candidates, and 16 topics. They insert **zero candidate statements**. Passwords are not stored in migration files. Migrations run explicitly against the intended database, rather than on public requests or every preview build. See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## 2. Connect the GitHub repository

In Cloudflare's dashboard, create a **Pages** project using Git integration and select `Matthew-Hawk/TheGreatRace`:

- Production branch: `main`.
- Framework preset: **None**.
- Root directory: repository root (leave blank).
- Build command: **`npm run build:pages`**.
- Build output directory: **`public`**.
- Node version: **`24.15.0`**, already pinned in `.node-version`; optionally set `NODE_VERSION=24.15.0` in the build environment.

Commit your real database IDs and push before deploying. Pages discovers `functions/api/[[path]].js` at the repository root. `_routes.json` sends only `/api/*` through Functions; `_redirects` handles direct visits to the application pages. Static assets stay on Pages' asset serving path. The build also compiles Functions locally as a compatibility check; Pages performs its normal Functions deployment from `functions/`.

Do not use a dashboard drag-and-drop upload of `public/` for this app: that does not deploy the source Functions workflow. Use Git integration or Wrangler. See [Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

## 3. Configure encrypted contributor secrets

In the Pages project's settings, add these as **encrypted secrets**, then redeploy:

- `RESEARCHER_PASSWORD`: a strong password of at least 12 characters.
- `REVIEWER_PASSWORD`: a different strong password of at least 12 characters.
- `SESSION_SECRET`: at least 32 random characters. For example, generate a value locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and save it directly in Cloudflare.

Assign contributor accounts to different humans. Public browsing works without these secrets; contributor sign-in is disabled until they are configured. Configure preview secrets separately if you want to test editorial actions on branch previews. Never put real passwords or signing secrets in `wrangler.jsonc`, GitHub, browser code, or build artifacts.

The Pages implementation uses Web Crypto HMAC to check secret-backed credentials, keeps random session tokens in HttpOnly/SameSite cookies, and stores only token hashes and keyed credential-version markers in D1. HTTPS enables Secure cookies automatically. Changing a password or SESSION_SECRET invalidates existing sessions. The Node-only APP_ORIGIN, DATABASE_PATH, and COOKIE_SECURE variables are not used on Pages; writes must come from the current deployment's own origin.

## 4. Check the deployed app

Open `/`, `/races`, `/compare`, `/methodology`, and `/editorial` directly. `/api/comparison` should return JSON with two candidates, 16 topics, and no statements until people enter and review them. Verify that a researcher can save a draft, only a different reviewer can verify it, and verification requires source-read confirmation. Check that a reload retains data.

If the page opens but the comparison fails, inspect the Pages Functions logs and check that `DB` is bound and both migrations were applied to the correct environment. If sign-in fails, check the three encrypted secrets and redeploy.

## Optional: scheduled source checks

Pages Functions do not run the local Node server's 24-hour timer. A separate scheduled Worker is provided in `cloudflare/scheduler.js` and `wrangler.scheduler.jsonc`. After configuring its production D1 ID, validate and deploy it:

```sh
npm run check:scheduler
npx wrangler deploy --config wrangler.scheduler.jsonc
```

This is an optional, separately deployed Cloudflare resource. Its cron runs hourly in UTC and checks the five oldest verified source records per run. Bounded batches fit the free plan's query limits and rotate through the record over time. Unavailable sources remain published with a notice and a deduplicated review task. Recovery resolves the link task. No private-network or service bindings should be attached to this Worker. Bot protection and IPv6-only or unsupported hostnames can require manual inspection. Review [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) before changing the schedule.

## Local Pages development and tests

```sh
npm run build:pages
npm run pages:migrate:local
npm run pages:dev
```

Copy `.dev.vars.example` to ignored `.dev.vars` and set the same three secrets if you need contributor sign-in locally. Wrangler prints the local URL. `.dev.vars` applies to Wrangler, while `.env` configures the separate Node development server. Local D1 storage stays under ignored `.wrangler/`; it does not upload your local SQLite data or edit remote D1.

```sh
npm run test:pages          # D1-backed API, sessions, review, CSV, source checks
npm run test:browser:pages  # Actual compiled Pages Worker and isolated D1
```

Run `npm run build:pages` before Pages browser tests. Those tests create an isolated project inside `.wrangler/`, use public EXAMPLE ONLY credentials and fictional claims, and never access remote databases or overwrite your `.dev.vars`. They run the same desktop/mobile, accessibility, and editorial workflow checks as the Node browser suite.

## Limits and future migrations

Pages CSV imports accept **20 rows per transaction**, while the local Node version accepts 200. Each record and its audit event consume D1 queries, so the smaller atomic import fits the [free plan's per-invocation query limit](https://developers.cloudflare.com/d1/platform/limits/). Split larger imports into smaller files.

D1 cannot register the Node SQLite driver's custom SQL URL validator. Shared application validation parses the full source URL, and D1 independently enforces HTTP(S) shape, nonempty sources, separate reviewer identity, and source-read attestation. Write content through the API rather than treating direct SQL as an editorial workflow.

Add future D1 changes as new numbered files in `cloudflare/migrations/`; do not edit applied migrations. Node migrations remain in `server/migrations/`. Keep both schemas and seed topics aligned, and extend the platform tests when rules change. Apply and verify preview migrations before production, export/back up content before destructive schema changes, and configure monitoring appropriate to your Cloudflare plan.

Deployment readiness does not approve candidate facts, research, or editorial policy. Those outstanding owner decisions remain in [the launch checklist](../LAUNCH_CHECKLIST.md).
