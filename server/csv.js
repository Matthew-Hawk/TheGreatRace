import { ValidationError } from './domain.js';
import { transaction } from './database.js';
import { audit, createDraft } from './repository.js';

/** Small RFC-4180-style parser: quoted commas, escaped quotes, and multiline cells. */
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length > 200000)
    throw new ValidationError('CSV must be text under 200 KB.');
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else cell += char;
    } else if (char === '"' && cell === '' && !closedQuote) quoted = true;
    else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell);
      cell = '';
      closedQuote = false;
      if (char !== ',') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (closedQuote || char === '"') throw new ValidationError('Malformed CSV quotation.');
      cell += char;
    }
  }
  if (quoted) throw new ValidationError('CSV has an unclosed quoted field.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new ValidationError('CSV needs a header and at least one data row.');
  const headers = rows.shift().map((value) => value.trim().replace(/^\uFEFF/, ''));
  if (new Set(headers).size !== headers.length)
    throw new ValidationError('CSV headers must be unique.');
  const required = [
    'candidate_id',
    'topic_id',
    'text',
    'text_type',
    'source_url',
    'source_type',
    'source_title',
  ];
  if (required.some((key) => !headers.includes(key)))
    throw new ValidationError(`Required CSV headers: ${required.join(', ')}.`);
  if (rows.length > 200) throw new ValidationError('Import at most 200 statements at a time.');
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new ValidationError(`CSV row ${i + 2} has the wrong number of columns.`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j]]));
  });
}

export function importDrafts(db, actor, csv) {
  const rows = parseCsv(csv);
  // One transaction prevents partially importing a batch when a later row is invalid.
  return transaction(db, () => {
    const ids = rows.map((row) => createDraft(db, actor, row));
    audit(db, actor.id, 'csv.imported', null, { count: ids.length });
    return ids;
  });
}
