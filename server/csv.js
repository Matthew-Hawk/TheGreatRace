import { transaction } from './database.js';
import { audit, createDraft } from './repository.js';
import { parseCsv } from './csv-parser.js';
export { parseCsv } from './csv-parser.js';

export function importDrafts(db, actor, csv) {
  const rows = parseCsv(csv);
  // One transaction prevents partially importing a batch when a later row is invalid.
  return transaction(db, () => {
    const ids = rows.map((row) => createDraft(db, actor, row));
    audit(db, actor.id, 'csv.imported', null, { count: ids.length });
    return ids;
  });
}
