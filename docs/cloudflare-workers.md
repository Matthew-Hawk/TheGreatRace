# Deploy from the Cloudflare Workers dashboard

Use this guide if Cloudflare runs a **deploy command** such as `npx wrangler deploy` after the build. That is the Workers Git integration. Pages and Workers are different deployment targets even though the dashboard groups them together.

The original log showed a successful build followed by a Workers deployment using the Pages configuration. The repo now includes `cloudflare/worker.js` and `wrangler.worker.jsonc`, which deploy the website assets and API together as one Worker. **You do not need another API repository, an external API provider, or an API URL in the frontend.** D1 is the persistent database and requires one-time setup in your account.

## What is already in this repository

- Typed frontend and public assets under `public/`.
- A Worker entry point that routes `/api/*` to the existing authenticated API.
- Asset routing for direct visits to race, comparison, methodology, and editorial pages.
- D1 migrations that create tables, the proposed race, and topics without candidate statements.
- Separate researcher/reviewer access, source verification, imports, corrections, and audit history.
- Workers deployment commands and tests against an isolated local Worker/D1 runtime.

No remote D1 database, Cloudflare secrets, custom domain, or live deployment has been created by these repository changes. Placeholder database IDs do not represent real resources.

## What you need to do

### 1. Create a D1 database

From a local checkout with dependencies installed, sign into your Cloudflare account and create the database:

```sh
npm ci --ignore-scripts
npx wrangler login
npx wrangler d1 create the-great-race
```

Alternatively create a D1 database named `the-great-race` in the Cloudflare dashboard. Copy its database ID. Replace the placeholder `database_id` in **`wrangler.worker.jsonc`**, then commit and push that change to `main`. The binding name must remain **`DB`**. The ID is not a password or token and is safe to commit.

If your existing Worker is named something other than `the-great-race`, set the configuration's `name` to that existing Worker name too. The configuration name and the dashboard Worker should match.

### 2. Initialize that database

With the real ID saved in the local configuration, run:

```sh
npm run worker:migrate:remote
```

This applies the schema and seeds to your account's D1 database. It does not invent candidate statements or copy the local Node SQLite database. The API needs these migrations before it can return comparisons or save research.

### 3. Correct the Worker build settings

In your existing Worker, open **Settings → Builds** and use:

- Root directory: repository root (leave blank).
- Build command: **`npm run build`**.
- Deploy command: **`npm run deploy`**.
- Production branch: **`main`**.
- Node version: `24.15.0`, already specified by `.node-version`.

`npm run deploy` explicitly selects `wrangler.worker.jsonc`. Keeping plain `npx wrangler deploy` would select the Pages configuration and reproduce the original error. Do not add a Pages output-directory setting to this Workers project; the assets directory is defined in the Worker configuration.

Keep non-production automatic builds disabled until you configure an isolated preview database and preview Worker. The production configuration is not a safe preview target. If you later enable non-production builds, give them a separate config and an explicit deploy/upload command rather than the dashboard's default command.

### 4. Set contributor secrets

In the Worker's **Settings → Variables and Secrets**, add these as **encrypted secrets**:

- `RESEARCHER_PASSWORD`: at least 12 characters.
- `REVIEWER_PASSWORD`: a different password of at least 12 characters.
- `SESSION_SECRET`: at least 32 random characters.

Generate a signing secret locally if needed:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store the generated value directly in Cloudflare, not in Git or a chat message. Assign researcher and reviewer accounts to different humans. Public reading works without these secrets, but contributor sign-in does not. No API key for a third-party service is needed.

### 5. Redeploy and verify

Retry the deployment from the latest `main` commit. Check `/api/comparison`: it should return JSON containing the proposed race, two candidates, 16 topics, and zero statements. Then open `/editorial` to test contributor access. A missing `DB` binding or unapplied migration requires database setup; a missing password or signing secret requires secret setup. These are separate from the entry-point error in your log.

The build token must be allowed to deploy the Worker and bind your D1 database. If Cloudflare reports a permissions error, adjust that token's Worker/D1 permissions in the account; repository code cannot grant those permissions.

## Local validation

```sh
npm run build
npm run check:worker          # Packages the Worker and assets; does not publish
npm run test:browser:worker   # Real local Worker, fresh D1, fictional content
```

`npm run worker:dev` runs your Worker locally. Apply local migrations first with `npm run worker:migrate:local`; copy `.dev.vars.example` to `.dev.vars` if you want local sign-in. These are separate from remote initialization and secrets.

Scheduled source checks remain an optional separate Worker, documented in [the Pages guide](cloudflare-pages.md#optional-scheduled-source-checks). They have not been deployed. Candidate pairing confirmation, human research, and editorial approval also remain outstanding; see [the launch checklist](../LAUNCH_CHECKLIST.md).

Reference: [Cloudflare Workers static assets and bindings](https://developers.cloudflare.com/workers/static-assets/binding/).
