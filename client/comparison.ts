import type { Candidate, Comparison, Statement } from './models.js';
import { api, html, sourceLink, formatDate, message } from './ui.js';

function candidateHeading(candidate: Candidate): string {
  const republican = candidate.party === 'Republican';
  return `<div class="candidate-heading ${republican ? 'republican' : 'democratic'}">
    <span class="monogram" aria-hidden="true">${candidate.name
      .split(' ')
      .map((word) => html(word[0]))
      .join('')}</span>
    <div><span class="party"><span aria-hidden="true">●</span> ${html(candidate.party)}</span><h3>${html(candidate.name)}</h3>
    <span class="candidate-meta">Proposed comparison · U.S. Senate</span></div></div>`;
}

function statementCard(statement: Statement): string {
  const link = sourceLink(statement.source_url);
  // Fail closed even if the API ever accidentally supplies an unsafe or unpublished record.
  if (statement.review_status !== 'verified' || !link) return '';
  return `<article class="statement"><span class="eyebrow">${statement.text_type === 'direct_quote' ? 'Direct quote' : 'Paraphrase'}</span>
    <p>${html(statement.text)}</p><div class="statement-meta">${html(formatDate(statement.statement_date))} · Verified</div>
    <div class="source-row">${link}<button class="text-button correction-trigger" data-id="${html(statement.id)}">Suggest a correction</button></div>
    <small>${html(statement.source_title)} · ${html(statement.source_type)}<br>Record added ${html(formatDate(statement.created_at))}</small>
    ${statement.link_status === 'unavailable' ? '<p class="source-warning">Source currently unavailable, please check back.</p>' : ''}</article>`;
}

const empty = `<div class="empty-statement"><span class="empty-mark" aria-hidden="true">—</span><p>No sourced statement recorded</p><span>Awaiting source research and human review.</span></div>`;

export function renderComparison(root: HTMLElement, data: Comparison): void {
  let selectedTopic = '',
    keyword = '';
  root.innerHTML = `<section class="intro"><div class="eyebrow"><span class="small-line"></span> THE TEXAS COMPARISON</div>
    <h1>Know where they stand.<br><em>Go straight to the source.</em></h1>
    <p>Two candidates. The same questions. A side-by-side look at their<br class="desktop-break"> stated positions, backed by the original sources.</p>
    <div class="intro-bottom"><span class="race-label">Texas <span aria-hidden="true">/</span> U.S. Senate</span><span class="outline-badge">Research in progress</span></div></section>
    <div class="scope-note"><span aria-hidden="true">ⓘ</span><p><strong>A comparison in preparation.</strong> Candidate pairing is proposed and awaits confirmation. No candidate statements have been seeded. Missing records describe our research, not a candidate’s views.</p></div>
    <div class="workspace"><aside class="topic-sidebar" aria-label="Policy topics"><div class="sidebar-heading">EXPLORE THE ISSUES <span>${data.topics.length}</span></div>
      <div class="topic-nav"><button class="topic-button active" data-topic="" aria-pressed="true">All topics <span>↗</span></button>
      ${data.topics.map((topic) => `<button class="topic-button" data-topic="${html(topic.id)}" aria-pressed="false">${html(topic.name)}</button>`).join('')}</div>
      <div class="sidebar-note"><span class="note-symbol" aria-hidden="true">↗</span><strong>Evidence comes first.</strong><p>Every published statement links to where the candidate said it.</p><a href="/methodology">Read our sourcing policy →</a></div></aside>
      <section class="comparison-region" aria-label="Candidate position comparison"><div class="comparison-toolbar"><div><span class="eyebrow">THE POLICY RECORD</span><h2 id="comparison-title">All topics</h2></div>
        <label class="search"><span aria-hidden="true">⌕</span><span class="sr-only">Search topics and statements</span><input id="search" type="search" placeholder="Search the comparison…" autocomplete="off"></label></div>
        <div id="result-count" class="results-summary" role="status"></div>
        <div id="comparison-table"></div>
        <div class="record-note"><span aria-hidden="true">◇</span><p><strong>An empty record is not a position.</strong> We publish only statements that have a source and independent human verification. This comparison includes Democratic and Republican candidates only.</p></div>
      </section></div>`;

  const table = root.querySelector<HTMLElement>('#comparison-table')!;
  function update(): void {
    const topics = data.topics.filter(
      (topic) =>
        (!selectedTopic || selectedTopic === topic.id) &&
        (!keyword ||
          `${topic.name} ${topic.description}`.toLowerCase().includes(keyword) ||
          data.statements.some(
            (statement) =>
              statement.topic_id === topic.id && statement.text.toLowerCase().includes(keyword),
          )),
    );
    root.querySelector('#comparison-title')!.textContent = selectedTopic
      ? data.topics.find((topic) => topic.id === selectedTopic)!.name
      : 'All topics';
    root.querySelector('#result-count')!.textContent =
      `${topics.length} ${topics.length === 1 ? 'topic' : 'topics'} · ${data.statements.length} verified ${data.statements.length === 1 ? 'statement' : 'statements'} in the record`;
    table.innerHTML = topics.length
      ? `<table class="comparison-table"><caption class="sr-only">Candidates compared under the same policy topics</caption><thead><tr>${data.candidates.map((candidate) => `<th scope="col">${candidateHeading(candidate)}</th>`).join('')}</tr></thead>
      ${topics
        .map(
          (
            topic,
            index,
          ) => `<tbody><tr class="topic-row"><th colspan="2" scope="colgroup"><span class="topic-number">${String(topic.sort_order + 1).padStart(2, '0')}</span><span>${html(topic.name)}</span><span class="topic-description">${html(topic.description)}</span></th></tr>
      <tr class="position-row">${data.candidates
        .map((candidate) => {
          const statements = data.statements
            .filter(
              (statement) =>
                statement.candidate_id === candidate.id && statement.topic_id === topic.id,
            )
            .map(statementCard)
            .filter(Boolean);
          return `<td><span class="mobile-candidate ${candidate.party.toLowerCase()}">${html(candidate.name)} · ${html(candidate.party)}</span>${statements.join('') || empty}</td>`;
        })
        .join('')}</tr></tbody>`,
        )
        .join('')}</table>`
      : `<div class="no-results"><span aria-hidden="true">⌕</span><h3>No matching topics</h3><p>Try a broader search or reset your filters.</p><button id="clear-filters" class="primary-button">Clear filters</button></div>`;
    table.querySelector('#clear-filters')?.addEventListener('click', () => {
      selectedTopic = '';
      keyword = '';
      (root.querySelector('#search') as HTMLInputElement).value = '';
      updateButtons();
      update();
      root.querySelector<HTMLInputElement>('#search')!.focus();
    });
    table
      .querySelectorAll<HTMLButtonElement>('.correction-trigger')
      .forEach((button) =>
        button.addEventListener('click', () => openCorrection(button.dataset.id!, button)),
      );
  }
  function updateButtons(): void {
    root.querySelectorAll<HTMLButtonElement>('[data-topic]').forEach((button) => {
      const active = button.dataset.topic === selectedTopic;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  root.querySelectorAll<HTMLButtonElement>('[data-topic]').forEach((button) =>
    button.addEventListener('click', () => {
      selectedTopic = button.dataset.topic!;
      updateButtons();
      update();
    }),
  );
  root.querySelector<HTMLInputElement>('#search')!.addEventListener('input', (event) => {
    keyword = (event.target as HTMLInputElement).value.trim().toLowerCase();
    update();
  });
  update();
}

function openCorrection(id: string, trigger: HTMLElement): void {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'correction-title');
  dialog.innerHTML = `<form><span class="eyebrow">HELP IMPROVE THE RECORD</span><h2 id="correction-title">Suggest a correction</h2><p>Describe the issue and include a source if possible. Please do not include private information.</p><label>What should we review?<textarea name="message" required maxlength="2000" rows="5"></textarea></label><p class="form-message" role="status"></p><div class="button-row"><button class="primary-button" type="submit">Submit for review</button><button type="button" class="secondary-button close-dialog">Cancel</button></div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('.close-dialog')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger.focus();
  });
  dialog.querySelector('form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    submit.disabled = true;
    try {
      await api('/corrections', { statement_id: id, message: new FormData(form).get('message') });
      message(
        form.querySelector('.form-message')!,
        'Thank you. Your correction is in the review queue.',
      );
      submit.hidden = true;
      form.querySelector('.close-dialog')!.textContent = 'Close';
    } catch (error) {
      message(form.querySelector('.form-message')!, (error as Error).message, true);
      submit.disabled = false;
    }
  });
}
