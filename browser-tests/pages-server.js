import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { testEnv } from '../test/helpers.js';

// Run the same browser workflow against a real Pages Worker, with an isolated D1.
// All credentials below are public EXAMPLE ONLY test fixtures, never deployment secrets.
const project = resolve('.wrangler', 'browser-tests', randomUUID());
mkdirSync(project, { recursive: true });
// Wrangler locates its Pages project by the nearest package.json. Without this,
// its temporary bundle would inherit the parent repository's DB and variables.
writeFileSync(resolve(project, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
cpSync(resolve('public'), resolve(project, 'public'), { recursive: true });
cpSync(resolve('.wrangler/pages-build/index.js'), resolve(project, 'public/_worker.js'));
writeFileSync(
  resolve(project, 'wrangler.json'),
  JSON.stringify({
    name: 'great-race-browser-test',
    pages_build_output_dir: './public',
    compatibility_date: '2026-10-17',
    vars: { ...testEnv, SESSION_SECRET: 'EXAMPLE-ONLY-browser-test-secret-123456789' },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'great-race-browser-test',
        database_id: randomUUID(),
        migrations_dir: resolve('cloudflare/migrations'),
      },
    ],
  }),
);
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
const migration = spawn(
  process.execPath,
  [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local'],
  { stdio: 'inherit', env, cwd: project },
);
migration.on('exit', (code) => {
  if (code !== 0) process.exit(code || 1);
  const server = spawn(
    process.execPath,
    [
      wrangler,
      'pages',
      'dev',
      'public',
      '--port',
      '4191',
      '--ip',
      '127.0.0.1',
      '--show-interactive-dev-session=false',
    ],
    { stdio: 'inherit', env, cwd: project },
  );
  server.on('exit', (serverCode) => process.exit(serverCode || 0));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
});
