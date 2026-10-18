/** Escape every data value before interpolating HTML; event handlers are bound separately. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}
export const html = escapeHtml;

export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    data === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'The request failed. Please retry.');
  return payload as T;
}

export function message(target: HTMLElement, text: string, error = false): void {
  target.textContent = text;
  target.className = error ? 'form-message error' : 'form-message';
  target.setAttribute('role', error ? 'alert' : 'status');
}

export function formValues(form: HTMLFormElement): Record<string, FormDataEntryValue> {
  return Object.fromEntries(new FormData(form));
}

export function sourceLink(value: string | null, title = 'Source'): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return `<a class="source-link" href="${html(url.href)}" target="_blank" rel="noopener noreferrer">${html(title)} <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>`;
  } catch {
    return '';
  }
}

export function formatDate(value: string | null): string {
  if (!value) return 'Date not recorded';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}
