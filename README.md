# The Great Race

A candidate comparison app with an independently reviewed source behind every published statement. It includes public comparisons, topic and keyword filters, race discovery, a sourcing policy, and an authenticated editorial workspace.

## Run locally

Use **Node.js 24.15 or newer** and npm. Node's built-in SQLite driver needs no external database service.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open **http://127.0.0.1:4180**. First start applies migrations and seeds the proposed Texas Senate comparison and 16 topics. It creates **no statements**. `npm run dev` builds and starts the server; it does not watch files. Rebuild after frontend edits and restart after server edits.

The proposed pairing is James Talarico and Ken Paxton, taken from the brief. Candidate identity, party, and race details remain pending owner confirmation and are marked in the app. No election date or candidate positions have been invented.

## Enable contributor sign-in

Copy `.env.example` to `.env`. Set different `RESEARCHER_PASSWORD` and `REVIEWER_PASSWORD` values, each at least 12 characters, then restart. Visit `/editorial` and select `researcher` or `reviewer`. There are **no default passwords**. Keep `.env` private; it is ignored by Git.

Assign the accounts to different people. This MVP has two configured accounts, not a user-management system. Removing a password disables that account on restart; changing a password invalidates its sessions.

Public browsing works without passwords. Use the exact `APP_ORIGIN` URL for sign-in, since writes enforce an exact origin check. When changing the port, update both `PORT` and `APP_ORIGIN`.

## How the app is organized

```text
client/
  app.ts             Page loading, navigation state, and recovery
  comparison.ts      Shared topics, candidate columns, filters, corrections
  editorial.ts       Sign-in, draft forms, review queue, audit history
  pages.ts           Race discovery and public sourcing policy
  models.ts          Typed API payloads
  ui.ts              Escaping, source links, dates, and request helpers
server/
  app.js             HTTP routes, limits, origin checks, static files
  auth.js            Password hashing, sessions, and configured accounts
  domain.js          Editorial and input validation rules
  database.js        SQLite connection, migrations, empty-content seeds
  migrations/        Versioned SQL schema and database constraints
  repository.js      Transactional statement, review, and audit writes
  csv.js             CSV parsing and atomic draft-only imports
  link-health.js     Restricted source requests and availability checks
public/              HTML shell, readable CSS, favicon, generated assets
scripts/             Seed and link-check entry points
test/                Domain and HTTP tests with in-memory data
browser-tests/       Desktop/mobile, editorial flow, accessibility tests
docs/architecture.md Request flow, trust boundaries, design decisions
```

TypeScript compiles `client/` into ignored `public/assets/`. Edit source rather than generated JavaScript. The backend uses small JavaScript modules with comments explaining trust boundaries and editorial rules. Prettier keeps formatting consistent.

The frontend uses native DOM APIs, semantic forms, a comparison table, and a native correction dialog. A component framework would add little to this initial four-page workflow. Node's HTTP, crypto, and SQLite modules keep runtime dependencies at zero. TypeScript, Prettier, Playwright, and axe are development tools only.

## Product rules

- **No link, no statement:** API validation and a SQLite constraint require a valid HTTP or HTTPS source for verification.
- A separate reviewer must open and read the source and explicitly confirm doing so.
- Only verified statements appear publicly. Drafts and flagged records stay in the editorial workspace.
- Both candidates share every topic. Missing records say **No sourced statement recorded**; that describes the dataset, not a candidate's views.
- Quotes and paraphrases are labeled. Known statement dates, record-added dates, source titles/types, and links are displayed.
- Imports create drafts regardless of any supplied review status.
- No rankings, scoring, recommendations, or invented political claims.
- Only Democratic and Republican candidates are included, with that limitation disclosed.

## Checks and tools

```sh
npm run format        # Apply consistent source formatting
npm run format:check  # Check formatting without changing files
npm run check         # Type-check the frontend
npm run build         # Compile browser assets
npm test              # Domain and HTTP integration tests
npm run test:browser  # Edge locally; Chromium in CI
npm run db:seed       # Idempotent migration/seed; no statement insertion
npm run links:check   # Check verified sources now
```

Local browser tests expect Microsoft Edge. GitHub Actions installs Chromium and runs the checks. Test statements are labeled **EXAMPLE ONLY** and stored in memory. Screenshots go to ignored `test-results/`. Test code and fixtures are never served by the application.

The server checks source links every 24 hours while running, starting 24 hours after startup. Run `npm run links:check` for an immediate pass. An unavailable source creates one open review task, leaves the statement published, and displays a notice. Recovery resolves the link task. A working URL never substitutes for human verification.

CSV imports accept up to 200 rows / 200 KB. Required headers: `candidate_id,topic_id,text,text_type,source_url,source_type,source_title`. Optional: `statement_date`. Use IDs from `/api/comparison`, `direct_quote` or `paraphrase` for text type, and `campaign`, `speech`, `interview`, `debate`, `official`, or `social_media` for source type. Leave unknown dates blank.

## Deployment and remaining work

This is a working **local research MVP**, not a published election guide. See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for outstanding owner decisions and operational work. For a single-instance deployment: build assets, run `npm start` under a process manager, mount persistent storage for `DATABASE_PATH`, terminate HTTPS at a reverse proxy, set the public HTTPS `APP_ORIGIN`, and enable `COOKIE_SECURE=true`.

SQLite data and credentials stay out of source control. Use SQLite online backup facilities or stop the server before copying database files. Do not copy only the main database file during active WAL writes.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [the architecture guide](docs/architecture.md) before contributing.
