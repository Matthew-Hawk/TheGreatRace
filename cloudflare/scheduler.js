import { checkVerifiedLinks } from './link-health.js';

// Pages Functions have no scheduled entry point. Deploy this optional Worker separately.
export default {
  async scheduled(_controller, env, _context) {
    const result = await checkVerifiedLinks(env.DB);
    console.log('Source check completed:', JSON.stringify(result));
  },
};
