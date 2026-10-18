import type { Comparison } from './models.js';
import { html } from './ui.js';

export function renderRaces(root: HTMLElement, data: Comparison): void {
  root.innerHTML = `<section class="page-intro"><span class="eyebrow">FOLLOW THE RECORD</span><h1>Explore the races.</h1><p>Start with the race. Look closer at the issues.</p></section>
    <section class="race-browser"><label class="search"><span aria-hidden="true">⌕</span><span class="sr-only">Search races by state or office</span><input type="search" placeholder="Search by state or office…"></label>
    <div id="race-results" role="status"></div></section>`;
  const results = root.querySelector('#race-results')!;
  function update(search = ''): void {
    results.innerHTML = `${data.race.state} ${data.race.office}`
      .toLowerCase()
      .includes(search.toLowerCase())
      ? `<a href="/compare" class="race-card"><span class="eyebrow">${html(data.race.state)} · ${html(data.race.office)}</span><span class="outline-badge">Pairing pending confirmation</span><h2>${data.candidates.map((candidate) => html(candidate.name)).join(' <span>vs.</span> ')}</h2><p>16 shared policy topics · ${data.statements.length} verified statements</p><span class="race-action">Explore this comparison →</span></a>`
      : '<div class="no-results"><h2>No matching races</h2><p>Try “Texas” or “Senate”. The MVP covers one proposed race.</p></div>';
  }
  root
    .querySelector('input')!
    .addEventListener('input', (event) => update((event.target as HTMLInputElement).value.trim()));
  update();
}

export function renderMethodology(root: HTMLElement): void {
  root.innerHTML = `<section class="page-intro"><span class="eyebrow">OUR APPROACH</span><h1>The source is the starting point.</h1><p>A transparent record of what candidates say, and where they say it.</p></section>
    <div class="policy-layout"><aside><span class="eyebrow">THE PRINCIPLE</span><p class="policy-pullquote">“No link,<br>no statement.”</p></aside><article class="prose">
    <h2>One structure. Both candidates.</h2><p>Every policy topic appears for both candidates. This project compares only Republican and Democratic candidates. It does not score, rank, endorse, or recommend either candidate.</p>
    <h2>What enters the record</h2><p>Researchers enter a candidate’s statement with its original source, source title and type, and the date when known. Direct quotes and neutral paraphrases are labeled separately. Proposed source types include campaign pages, speeches, interviews, debates, official statements, and social media; the owner must approve the sourcing policy before launch.</p>
    <h2>Independent human verification</h2><p>A different person must open and read the source and explicitly confirm doing so before verifying a statement. An AI-generated summary or a working URL does not establish accuracy. Drafts and flagged statements stay out of the public comparison.</p>
    <h2>What an empty space means</h2><p>“No sourced statement recorded” means we have not published a verified statement on that topic. It does not mean the candidate has no view. We never fill a gap by guessing.</p>
    <h2>Dates, changes, and unavailable sources</h2><p>Multiple dated statements can appear under a topic so the record can preserve changes over time. Unknown statement dates are labeled. Source availability is tracked separately from editorial review. When a checked link is unavailable, the statement stays visible with a notice and a review task is created.</p>
    <h2>Corrections are part of the process</h2><p>Use “Suggest a correction” beneath any published statement to describe a problem. This creates a task for a human reviewer; it does not automatically change the record. Editorial actions are logged. Response ownership and turnaround times must be assigned before public launch.</p>
    <div class="scope-note"><p><strong>Research preview.</strong> The candidate pairing and sourcing policy are awaiting owner confirmation. No real statements were seeded. This site is not an official election guide.</p></div>
    <a class="primary-button" href="/compare">Back to the comparison →</a></article></div>`;
}
