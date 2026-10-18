import type { Comparison } from './models.js';
import { api, html } from './ui.js';
import { renderComparison } from './comparison.js';
import { renderMethodology, renderRaces } from './pages.js';
import { renderEditorial } from './editorial.js';

const root = document.querySelector<HTMLElement>('#app')!;
const route = window.location.pathname;
document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((link) => {
  const active = link.pathname === route || (route === '/' && link.pathname === '/compare');
  if (active) link.setAttribute('aria-current', 'page');
});

async function start(): Promise<void> {
  root.setAttribute('aria-busy', 'true');
  try {
    if (route === '/methodology') {
      renderMethodology(root);
      return;
    }
    const data = await api<Comparison>('/comparison');
    if (route === '/races') renderRaces(root, data);
    else if (route === '/editorial') await renderEditorial(root, data);
    else renderComparison(root, data);
  } catch (error) {
    root.innerHTML = `<section class="no-results" role="alert"><span class="eyebrow">THE RECORD IS TEMPORARILY UNAVAILABLE</span><h1>Let’s try that again.</h1><p>${html((error as Error).message)}</p><button class="primary-button" id="retry">Retry loading</button></section>`;
    root.querySelector('#retry')!.addEventListener('click', () => void start());
  } finally {
    root.removeAttribute('aria-busy');
  }
}
void start();
