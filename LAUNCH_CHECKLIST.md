# Launch checklist

## Implemented in the local MVP

- [x] Shared policy topics and side-by-side candidates, with stacked mobile labels.
- [x] Topic filters, keyword search, race discovery, loading/error recovery, and empty states.
- [x] Human-entered statements only; no candidate statements in seed data.
- [x] Source links, quote/paraphrase labels, statement dates, added dates, and verification labels.
- [x] Source validation in both the API and SQLite verification constraint.
- [x] Researcher/reviewer sign-in, separate review, and source-read attestation.
- [x] Atomic draft-only CSV imports and transactional editorial audit events.
- [x] Corrections queue, task resolution, source-health notices, and periodic checks.
- [x] Published sourcing/corrections process and disclosure of two-party scope.
- [x] Domain/API and browser workflow tests with fictional, isolated data.
- [x] Automated WCAG AA rule checks on all four public/sign-in pages.
- [x] Contributor documentation, formatter, typed frontend, and CI configuration.
- [x] Pages Functions/D1 adapter, migrations, static routing, configuration, and setup guide.
- [x] Separate preview database configuration and optional Cron Worker for source checks.

## Required owner decisions and content work

- [ ] Confirm race, names, party labels, and candidate pairing against official sources.
- [ ] Approve the taxonomy and source types, including official-capacity statements.
- [ ] Assign distinct human researchers and reviewers; approve neutral paraphrase rules.
- [ ] Research and verify real statements before publishing candidate claims.
- [ ] Assign a corrections owner, response expectations, and operational contact.
- [ ] Review quotation rights, content use, and editorial policy before public launch.

## Required operational work before public launch

- [ ] Select hosting and domain; this implementation has not been deployed.
- [ ] For Pages, create D1 databases, configure their IDs and encrypted secrets, and apply migrations before launch.
- [ ] Configure persistent storage, backups, and a tested restore procedure.
- [ ] Set a real HTTPS APP_ORIGIN, secure cookies, strong credentials, and process supervision.
- [ ] Replace the two role accounts with individual identities before expanding the team.
- [ ] Configure a trusted proxy rate limiter and review authentication requirements.
- [ ] Use a durable scheduler and monitor failed source checks; the local timer needs a running server.
- [ ] Review IPv6-only sources and false failures from bot protection or timeouts.
- [ ] Perform human keyboard/screen-reader accessibility review and usability testing.
- [ ] Measure performance with realistic content and complete hosting-specific security review.
- [ ] Run CI on the remote repository and confirm dependencies on the target runner.

## Known initial limits

The app covers one proposed race. The schema holds more races, but public routing and queries need expansion. Corrections use new drafts and flagging rather than an in-place editor. The audit log has no application delete action but is not tamper-proof against a database administrator. Node rate limits and scheduling are process-local; Pages uses shared D1 login/correction limits and an optional separately deployed Cron Worker. Link checks do not establish factual accuracy or guarantee availability to every visitor.
