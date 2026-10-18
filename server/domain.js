/** Editorial validation lives here so API entry and CSV import share the same rules. */
export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function requiredText(value, label, max = 3000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new ValidationError(`${label} is required and must be ${max} characters or fewer.`);
  }
  return value.trim();
}

export function validateSourceUrl(value) {
  const source = requiredText(value, 'Source URL', 2048);
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new ValidationError('Enter a complete HTTP or HTTPS source URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new ValidationError('Use an HTTP or HTTPS URL without embedded credentials.');
  }
  return url.href;
}

export function validateDraft(input) {
  if (!input || typeof input !== 'object')
    throw new ValidationError('A statement object is required.');
  if (!['direct_quote', 'paraphrase'].includes(input.text_type))
    throw new ValidationError('Choose direct quote or paraphrase.');
  const allowedSources = ['campaign', 'speech', 'interview', 'debate', 'official', 'social_media'];
  if (!allowedSources.includes(input.source_type))
    throw new ValidationError('Choose a supported source type.');
  let date = input.statement_date || null;
  if (
    date &&
    (typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  ) {
    throw new ValidationError('Statement date must be a real date in YYYY-MM-DD format, or blank.');
  }
  return {
    candidate_id: requiredText(input.candidate_id, 'Candidate', 100),
    topic_id: requiredText(input.topic_id, 'Topic', 100),
    text: requiredText(input.text, 'Statement'),
    text_type: input.text_type,
    // Drafts may lack a source while research is in progress; publication may not.
    source_url: input.source_url ? validateSourceUrl(input.source_url) : null,
    source_type: input.source_type,
    source_title: requiredText(input.source_title, 'Source title', 300),
    statement_date: date,
  };
}

export function assertReviewAllowed(statement, user, input) {
  if (!input || typeof input !== 'object')
    throw new ValidationError('A review object is required.');
  if (user.role !== 'reviewer') throw new ValidationError('A reviewer account is required.', 403);
  if (statement.added_by === user.id)
    throw new ValidationError('A different person must review this statement.', 403);
  if (!['verified', 'flagged'].includes(input.review_status))
    throw new ValidationError('Choose verified or flagged.');
  if (input.review_status === 'verified') {
    validateSourceUrl(statement.source_url);
    if (input.source_read !== true)
      throw new ValidationError('Confirm that you opened and read the source before verifying.');
  }
}
