import { openDatabase } from './database.js';
import { configureUsers } from './auth.js';
import { createApp } from './app.js';
import { scheduleLinkChecks } from './link-health.js';

const db = openDatabase();
configureUsers(db);
const server = createApp(db);
const linkTimer = scheduleLinkChecks(db);
const port = Number(process.env.PORT || 4180),
  host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () =>
  console.log(`The Great Race is ready at ${process.env.APP_ORIGIN || `http://${host}:${port}`}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(linkTimer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
