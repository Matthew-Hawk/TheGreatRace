import type { Comparison, EditorialData, Statement, User } from './models.js';
import { api, html, sourceLink, formatDate, formValues, message } from './ui.js';

export async function renderEditorial(root: HTMLElement, data: Comparison): Promise<void> {
  const { user } = await api<{ user: User | null }>('/session');
  if (!user) return renderLogin(root, data);
  const editorial = await api<EditorialData>('/admin');
  root.innerHTML = `<section class="page-intro editorial-intro"><div><span class="eyebrow">THE HUMAN SIDE OF THE RECORD</span><h1>Editorial workspace.</h1><p>Signed in as <strong>${html(user.id)}</strong> · ${html(user.role)}</p></div><button id="logout" class="secondary-button">Sign out</button></section>
    <p id="workspace-message" class="form-message" role="status"></p>
    <div class="editorial-layout"><section class="editorial-panel"><span class="eyebrow">01 / RESEARCH</span><h2>Add a sourced statement</h2><p>New records are drafts. A different reviewer must read the source before publication.</p>
      <form id="draft-form"><label>Candidate<select name="candidate_id">${data.candidates.map((candidate) => `<option value="${html(candidate.id)}">${html(candidate.name)}</option>`).join('')}</select></label>
      <label>Policy topic<select name="topic_id">${data.topics.map((topic) => `<option value="${html(topic.id)}">${html(topic.name)}</option>`).join('')}</select></label>
      <label>Statement<textarea name="text" rows="4" maxlength="3000" required></textarea></label>
      <label>Text type<select name="text_type"><option value="direct_quote">Direct quote</option><option value="paraphrase">Neutral paraphrase</option></select></label>
      <label>Source URL <span class="field-hint">Optional for drafts; required for verification</span><input name="source_url" type="url" maxlength="2048" placeholder="https://…"></label>
      <label>Source title<input name="source_title" required maxlength="300"></label>
      <div class="field-pair"><label>Source type<select name="source_type"><option value="campaign">Campaign website</option><option value="speech">Speech</option><option value="interview">Interview</option><option value="debate">Debate</option><option value="official">Official statement</option><option value="social_media">Social media</option></select></label>
      <label>Statement date <span class="field-hint">Leave blank if unknown</span><input name="statement_date" type="date"></label></div>
      <p class="form-message" role="status"></p><button type="submit" class="primary-button">Save as draft →</button></form>
      <details class="import-details"><summary>Import drafts from CSV</summary><p>Up to 20 rows per batch on Cloudflare Pages, or 200 locally; maximum 200 KB. All records enter as drafts, regardless of any status in the file. Required columns: candidate_id, topic_id, text, text_type, source_url, source_type, source_title. Optional: statement_date.</p><form id="import-form"><label>CSV file<input name="file" type="file" accept=".csv,text/csv" required></label><p class="form-message" role="status"></p><button class="secondary-button">Import as drafts</button></form></details></section>
    <section class="review-panel"><span class="eyebrow">02 / INDEPENDENT REVIEW</span><h2>Statement record <span class="count">${editorial.statements.length}</span></h2>
      <p>Open the source. Check the wording and context. Verify only after reading it.</p><div id="statement-queue">${editorial.statements.length ? editorial.statements.map((statement) => reviewCard(statement, user, data)).join('') : '<div class="editorial-empty"><span aria-hidden="true">◇</span><h3>No research drafts yet</h3><p>Add a statement or import a CSV to start the review process.</p></div>'}</div>
      <div class="tasks"><span class="eyebrow">03 / CORRECTIONS & LINK HEALTH</span><h2>Open review tasks <span class="count">${editorial.tasks.length}</span></h2>
      ${editorial.tasks.length ? editorial.tasks.map((task) => `<article class="task"><span class="eyebrow">${html(task.kind.replace('_', ' '))}</span><p>${html(task.message)}</p><small>Statement ${html(task.statement_id)}</small>${user.role === 'reviewer' ? `<button class="secondary-button resolve-task" data-id="${html(task.id)}">Mark resolved</button>` : '<p>A reviewer can resolve this task.</p>'}</article>`).join('') : '<p>No open corrections or source issues.</p>'}</div></section></div>
    <section class="audit-panel"><span class="eyebrow">THE CHANGE HISTORY</span><h2>Recent editorial activity</h2><p>Most recent 100 events. Full history is retained in the database.</p><div class="audit-list">${editorial.audit.map((entry) => `<details><summary><span>${html(entry.action)}</span> <span>${html(entry.actor_id)} · ${html(formatDate(entry.created_at))}</span></summary><pre>${html(JSON.stringify(JSON.parse(entry.details), null, 2))}</pre></details>`).join('') || '<p>No editorial actions recorded.</p>'}</div></section>`;

  root.querySelector('#logout')!.addEventListener('click', async () => {
    try {
      await api('/logout', {});
      await renderEditorial(root, data);
    } catch (error) {
      message(root.querySelector('#workspace-message')!, (error as Error).message, true);
    }
  });
  wireForm(root.querySelector<HTMLFormElement>('#draft-form')!, async (form) => {
    await api('/statements', formValues(form));
    await renderEditorial(root, data);
    message(
      root.querySelector('#workspace-message')!,
      'Draft saved. It will appear publicly only after independent verification.',
    );
  });
  wireForm(root.querySelector<HTMLFormElement>('#import-form')!, async (form) => {
    const file = (form.querySelector('[name=file]') as HTMLInputElement).files?.[0];
    if (!file || file.size > 200000) throw new Error('Select a CSV file under 200 KB.');
    const result = await api<{ ids: string[] }>('/import', { csv: await file.text() });
    await renderEditorial(root, data);
    message(
      root.querySelector('#workspace-message')!,
      `${result.ids.length} drafts imported. Nothing was automatically verified.`,
    );
  });
  root.querySelectorAll<HTMLFormElement>('.review-form').forEach((form) =>
    wireForm(form, async (current, button) => {
      await api(`/statements/${form.dataset.id}/review`, {
        review_status: button || 'flagged',
        source_read: (current.querySelector('[name=source_read]') as HTMLInputElement).checked,
      });
      await renderEditorial(root, data);
      message(
        root.querySelector('#workspace-message')!,
        button === 'verified'
          ? 'Statement verified and published.'
          : 'Statement flagged and withheld from the public record.',
      );
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('.resolve-task').forEach((button) =>
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/tasks/${button.dataset.id}/resolve`, {});
        await renderEditorial(root, data);
        message(root.querySelector('#workspace-message')!, 'Review task resolved.');
      } catch (error) {
        button.disabled = false;
        message(root.querySelector('#workspace-message')!, (error as Error).message, true);
      }
    }),
  );
}

function reviewCard(statement: Statement, user: User, data: Comparison): string {
  const candidate = data.candidates.find((candidate) => candidate.id === statement.candidate_id);
  const topic = data.topics.find((topic) => topic.id === statement.topic_id);
  const canReview = user.role === 'reviewer' && statement.added_by !== user.id;
  return `<article class="review-card"><div class="review-top"><span class="eyebrow">${html(candidate?.name)} · ${html(topic?.name)}</span><span class="status-badge ${html(statement.review_status)}">${html(statement.review_status)}</span></div>
    <p>${html(statement.text)}</p><div class="statement-meta">${statement.text_type === 'direct_quote' ? 'Direct quote' : 'Paraphrase'} · ${html(formatDate(statement.statement_date))} · Added by ${html(statement.added_by)}</div>
    <p>${sourceLink(statement.source_url, 'Open original source') || '<strong>No source URL recorded. Add a new sourced draft before verification.</strong>'}</p><small>${html(statement.source_title)}</small>
    ${canReview ? `<form class="review-form" data-id="${html(statement.id)}"><label class="checkbox-label"><input name="source_read" type="checkbox"> I opened and read the source and checked this statement in context.</label><p class="form-message" role="status"></p><div class="button-row"><button name="action" value="verified" class="primary-button">Verify & publish</button><button name="action" value="flagged" class="secondary-button">Flag for review</button></div></form>` : `<p class="review-permission">${user.role !== 'reviewer' ? 'A separate reviewer account must verify this record.' : 'You authored this record. Another person must review it.'}</p>`}</article>`;
}

/** Keep form values on failure, prevent duplicate writes, and show errors at the action. */
function wireForm(
  form: HTMLFormElement,
  action: (form: HTMLFormElement, actionName?: string) => Promise<void>,
): void {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    const buttons = form.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach((button) => (button.disabled = true));
    const target = form.querySelector<HTMLElement>('.form-message')!;
    message(target, 'Saving…');
    try {
      await action(form, submitter?.value);
    } catch (error) {
      message(target, (error as Error).message, true);
    } finally {
      buttons.forEach((button) => (button.disabled = false));
    }
  });
}

function renderLogin(root: HTMLElement, data: Comparison): void {
  root.innerHTML = `<section class="login-layout"><div><span class="eyebrow">THE EDITORIAL DESK</span><h1>A record built<br>by people.</h1><p>Research carefully.<br>Review independently.<br>Publish with a source.</p><a href="/methodology">Our sourcing standards →</a></div>
    <section class="login-panel"><span class="eyebrow">CONTRIBUTOR ACCESS</span><h2>Welcome to the desk.</h2><p>Sign in with your configured researcher or reviewer account.</p><form id="login-form"><label>Username<select name="username"><option value="researcher">researcher</option><option value="reviewer">reviewer</option></select></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="500"></label><p class="form-message" role="status"></p><button type="submit" class="primary-button">Sign in →</button></form><details><summary>Setting up contributor access</summary><p>For local Node development, copy .env.example to .env and restart after setting the passwords. On Cloudflare Pages, configure RESEARCHER_PASSWORD, REVIEWER_PASSWORD, and SESSION_SECRET as encrypted secrets. See docs/cloudflare-pages.md. Passwords must be different and at least 12 characters. There are no default passwords. Real deployments must assign these accounts to different people.</p></details></section></section>`;
  wireForm(root.querySelector<HTMLFormElement>('#login-form')!, async (form) => {
    await api('/login', formValues(form));
    await renderEditorial(root, data);
  });
}
