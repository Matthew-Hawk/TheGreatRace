import { openDatabase } from '../server/database.js';
const db = openDatabase();
console.log('Race, candidates, and 16 topics are ready. No statements were seeded.');
db.close();
