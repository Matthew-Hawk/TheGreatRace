import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit',
  env: { ...process.env, WORKER_BROWSER_TEST: '1', WRANGLER_SEND_METRICS: 'false' },
});
child.on('exit', (code) => process.exit(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
