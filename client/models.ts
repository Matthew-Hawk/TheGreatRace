/** Public payloads deliberately exclude editor identities and unpublished research. */
export interface Candidate {
  id: string;
  name: string;
  party: 'Republican' | 'Democratic';
  race_id: string;
}
export interface Topic {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}
export interface Statement {
  id: string;
  candidate_id: string;
  topic_id: string;
  text: string;
  text_type: 'direct_quote' | 'paraphrase';
  source_url: string | null;
  source_title: string;
  source_type: string;
  statement_date: string | null;
  created_at: string;
  review_status: 'draft' | 'verified' | 'flagged';
  link_status: 'unchecked' | 'available' | 'unavailable';
  added_by?: string;
  reviewed_by?: string | null;
}
export interface Comparison {
  race: { id: string; office: string; state: string; status: string; election_date: string | null };
  candidates: Candidate[];
  topics: Topic[];
  statements: Statement[];
}
export interface User {
  id: string;
  role: 'researcher' | 'reviewer';
}
export interface ReviewTask {
  id: string;
  statement_id: string;
  kind: string;
  message: string;
  created_at: string;
}
export interface AuditEntry {
  id: number;
  actor_id: string;
  action: string;
  statement_id: string | null;
  created_at: string;
  details: string;
}
export interface EditorialData {
  statements: Statement[];
  tasks: ReviewTask[];
  audit: AuditEntry[];
}
