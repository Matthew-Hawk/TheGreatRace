# Contributing

## Before you start

Read the product rules and current implementation status in [README.md](README.md). Keep contributions focused on one understandable change. Describe the problem, the resulting behavior, and how you checked it.

Follow the setup commands and file map in the README. The app is a local Node.js/SQLite MVP with a TypeScript frontend. Remaining launch work is tracked in LAUNCH_CHECKLIST.md.

Cloudflare Pages uses the same frontend and validation with a separate async D1 adapter. Read [docs/cloudflare-pages.md](docs/cloudflare-pages.md), run `npm run build:pages` and `npm run test:pages` for API changes, and run `npm run test:browser:pages` for hosted workflow changes. Keep Node and D1 migrations aligned; their drivers and session formats differ, so do not copy the local SQLite file into D1.

## Write code others can follow

- Use domain names consistently: `race`, `candidate`, `topic`, and `statement`. API payloads and SQL use `review_status` and `source_url`; local functions and variables use camelCase.
- Name functions for what they do. Prefer `canVerifyStatement` to vague names such as `check` or `processData`.
- Keep functions focused on one responsibility. Separate data validation, persistence, editorial decisions, and rendering when those responsibilities emerge.
- Prefer explicit control flow and straightforward data structures. Extract helpers when they clarify a concept or remove meaningful duplication.
- Keep domain rules in a shared, testable place. UI checks improve feedback, but server validation and database constraints must enforce publication requirements.
- Use types or schemas to describe data shapes and allowed states. Do not rely on comments to enforce constraints.
- Follow the surrounding conventions. Introduce dependencies and abstractions only when the change needs them.

## Comment intent and constraints

Comments should explain **why** code exists, a subtle assumption, or a rule that would be easy to break. Avoid comments that simply repeat the next line of code.

Examples of useful comments:

```text
// Imports always create drafts: importing a URL does not establish human review.

// Render every topic for both candidates so missing data cannot hide a topic.

// Link availability is tracked separately from editorial verification.
```

Add a short module comment where a file owns a non-obvious responsibility or trust boundary. Document exported functions when callers need to understand input constraints, side effects, failure behavior, or a surprising return value. Simple functions with clear types and names do not need line-by-line narration.

Keep comments beside the code they explain and update them when behavior changes. Use TODOs only for specific follow-up work, with an issue reference when one exists. Do not put credentials, personal data, or unverified political claims in code comments or examples.

## Keep the architecture navigable

Keep the existing module responsibilities clear:

- Public pages and reusable UI components.
- Domain types, validation, and review rules.
- Server endpoints and authentication checks.
- Database schema, migrations, and seed data.
- Content import and source link checking tools.
- Automated tests and fictional fixtures.

The README maps these responsibilities to actual files. See [docs/architecture.md](docs/architecture.md) for the statement lifecycle and enforcement boundaries. Keep that map current when adding modules. Add numbered SQL migrations rather than editing migrations already applied to working databases.

## Handle content carefully

Start real statement data empty. Use only fictional, clearly labeled examples in development and tests, and keep them excluded from production data.

The review statuses are `draft`, `verified`, and `flagged`. Verification requires a valid source URL, a reviewer distinct from the author, and explicit confirmation that the reviewer opened and read the source. Imports create drafts only. Record editorial changes in an audit trail.

Public queries must select verified statements, and public rendering must preserve the source link. Show **No sourced statement recorded** when there is no verified statement; that describes the dataset, not the candidate's views.

Apply the same topic structure and sourcing rules to both candidates. Do not treat a successful link check as human verification. Unavailable sources retain their editorial status, show a public notice, and create a separate review task. Do not change that distinction accidentally.

## Check your changes

Run `npm run format:check`, `npm run check`, `npm run build`, and `npm test`. Run `npm run test:browser` for UI or API workflow changes (Edge must be installed locally). Add focused tests for behavioral changes, especially publication and review boundaries. Documentation-only changes generally need link and accuracy checks rather than new automated tests.

Keep these behaviors covered:

- A statement without a valid HTTP or HTTPS source cannot be verified.
- An author cannot verify their own statement.
- Verification requires confirmation that the reviewer read the source.
- Draft and flagged statements do not appear publicly.
- Published statements include source links and text-type labels.
- Both candidates have the same topic structure and the required empty state.
- Imported statements remain drafts.
- Fictional fixtures do not enter production seed data.

For UI changes, also check keyboard navigation, meaningful labels, readable contrast, and narrow-screen layouts.

## Prepare a contribution for review

Explain what changed and why. Include setup or migration steps when needed, the checks actually run and their results, and any remaining limitations. Update documentation when commands, structure, or domain behavior change. Never describe an unrun check as passing.
