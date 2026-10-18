import { openDatabase } from '../server/database.js';
import { configureUsers } from '../server/auth.js';

// EXAMPLE ONLY: these credentials and statement data exist exclusively in isolated tests.
export const testEnv = {
  RESEARCHER_PASSWORD: 'EXAMPLE-ONLY-research-824',
  REVIEWER_PASSWORD: 'EXAMPLE-ONLY-review-971',
};
export const researcher = { id: 'researcher', role: 'researcher' };
export const reviewer = { id: 'reviewer', role: 'reviewer' };
export function fixtureDatabase() {
  const db = openDatabase(':memory:');
  configureUsers(db, testEnv);
  return db;
}
export function exampleDraft(overrides = {}) {
  return {
    candidate_id: 'paxton',
    topic_id: 'education',
    text: 'EXAMPLE ONLY — fictional test statement, not a candidate claim.',
    text_type: 'direct_quote',
    source_url: 'https://example.com/fictional-source',
    source_type: 'speech',
    source_title: 'EXAMPLE ONLY — test source',
    statement_date: '',
    ...overrides,
  };
}
