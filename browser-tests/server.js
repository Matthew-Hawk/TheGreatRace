import { createApp } from '../server/app.js';
import { fixtureDatabase, testEnv } from '../test/helpers.js';

// Browser tests use memory only: fictional review data never touches the working database.
const db = fixtureDatabase();
const app = createApp(db, { ...testEnv, APP_ORIGIN: 'http://127.0.0.1:4191' });
app.listen(4191, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    app.close(() => {
      db.close();
      process.exit(0);
    }),
  );
