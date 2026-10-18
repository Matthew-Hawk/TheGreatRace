import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { testEnv } from '../test/helpers.js';

// EXAMPLE ONLY credentials and a fresh local database; never deploy this fixture.
const project = resolve('.wrangler', 'worker-browser-tests', randomUUID());
mkdirSync(project, { recursive: true });
writeFileSync(resolve(project, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const config = resolve(project, 'wrangler.json');
writeFileSync(
  config,
  JSON.stringify({
    name: 'great-race-worker-test',
    main: resolve('cloudflare/worker.js'),
    compatibility_date: '2026-10-17',
    assets: { directory: resolve('public'), binding: 'ASSETS', run_worker_first: true },
    vars: { ...testEnv, SESSION_SECRET: 'EXAMPLE-ONLY-worker-test-secret-123456789' },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'great-race-worker-test',
        database_id: randomUUID(),
        migrations_dir: resolve('cloudflare/migrations'),
      },
    ],
  }),
);
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const options = {
  stdio: 'inherit',
  cwd: project,
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
};
const migration = spawn(
  process.execPath,
  [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--config', config],
  options,
);
migration.on('exit', (code) => {
  if (code !== 0) process.exit(code || 1);
  const server = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--config',
      config,
      '--port',
      '4191',
      '--ip',
      '127.0.0.1',
      '--show-interactive-dev-session=false',
    ],
    options,
  );
  server.on('exit', (serverCode) => process.exit(serverCode || 0));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
});
