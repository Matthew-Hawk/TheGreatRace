import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { validateSourceUrl } from './domain.js';
import { recordLinkHealth } from './repository.js';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
])
  blocked.addSubnet(address, prefix, 'ipv4');

export const isPublicIPv4 = (address) => isIP(address) === 4 && !blocked.check(address, 'ipv4');

/** Pin the validated DNS result to the connection to prevent DNS-rebinding SSRF.
 * IPv6-only sites are conservatively treated as unavailable in this initial checker.
 */
export async function checkSource(source, redirects = 0, method = 'HEAD') {
  const url = new URL(validateSourceUrl(source));
  if (url.port && !['80', '443'].includes(url.port))
    throw new Error('Nonstandard ports are not checked.');
  if (isIP(url.hostname) || url.hostname.startsWith('[') || !url.hostname.includes('.'))
    throw new Error('Source must use a public DNS hostname.');
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIPv4(address)))
    throw new Error('Source resolves to a non-public address.');
  const pinnedAddress = addresses[0].address;
  const result = await new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method,
        headers: { 'User-Agent': 'TheGreatRace-SourceCheck/0.1', Accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(8000),
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: pinnedAddress, family: 4 }]);
          else callback(null, pinnedAddress, 4);
        },
      },
      (response) => {
        resolve({ status: response.statusCode || 0, location: response.headers.location });
        response.destroy();
      },
    );
    request.on('error', reject);
    request.end();
  });
  if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
    if (redirects >= 3) throw new Error('Too many redirects.');
    // Each redirect is revalidated, including DNS and the destination port.
    return checkSource(new URL(result.location, url).href, redirects + 1, method);
  }
  if ([405, 501].includes(result.status) && method === 'HEAD')
    return checkSource(source, redirects, 'GET');
  return result.status >= 200 && result.status < 300;
}

export async function checkVerifiedLinks(db, checker = checkSource) {
  const statements = db
    .prepare("SELECT id, source_url FROM statements WHERE review_status = 'verified'")
    .all();
  let unavailable = 0;
  for (const statement of statements) {
    let available = false;
    try {
      available = await checker(statement.source_url);
    } catch {
      /* Failure is recorded for human review, not inferred as retraction. */
    }
    if (!available) unavailable++;
    recordLinkHealth(db, statement.id, available);
  }
  return { checked: statements.length, unavailable };
}

export function scheduleLinkChecks(db, hours = 24) {
  let running = false;
  const timer = setInterval(
    async () => {
      if (running) return;
      running = true;
      try {
        await checkVerifiedLinks(db);
      } catch (error) {
        console.error('Link check failed:', error.message);
      } finally {
        running = false;
      }
    },
    hours * 60 * 60 * 1000,
  );
  timer.unref();
  return timer;
}
