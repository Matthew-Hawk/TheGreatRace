import { openDatabase } from '../server/database.js';
import { checkVerifiedLinks } from '../server/link-health.js';
const db = openDatabase();
try {
  console.log(await checkVerifiedLinks(db));
} finally {
  db.close();
}
