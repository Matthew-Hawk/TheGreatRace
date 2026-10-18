import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Use TypeScript's JSONC parser so comments and formatter-added trailing commas are valid.
const readConfig = (path) => {
  const result = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (result.error)
    throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'));
  return result.config;
};
const pages = readConfig('wrangler.jsonc'),
  scheduler = readConfig('wrangler.scheduler.jsonc');
const productionId = pages.d1_databases?.find((binding) => binding.binding === 'DB')?.database_id;
const previewId = pages.env?.preview?.d1_databases?.find(
  (binding) => binding.binding === 'DB',
)?.database_id;
const schedulerId = scheduler.d1_databases?.find(
  (binding) => binding.binding === 'DB',
)?.database_id;
const realId = (id) =>
  typeof id === 'string' &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) &&
  !id.startsWith('00000000-');
if (
  !realId(productionId) ||
  !realId(previewId) ||
  productionId === previewId ||
  schedulerId !== productionId
) {
  console.error(
    'Set distinct production and preview D1 IDs in wrangler.jsonc, and the matching production ID in wrangler.scheduler.jsonc. See docs/cloudflare-pages.md.',
  );
  process.exit(1);
}
console.log('Pages database IDs are configured and preview data is isolated from production.');
