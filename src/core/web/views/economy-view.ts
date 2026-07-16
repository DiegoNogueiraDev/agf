/*!
 * Economy view — pure HTML fragment for the Economia tab.
 * Task node_dc56b2ce0a3f.
 *
 * WHY: The dashboard needs a dedicated economy panel showing token/cost
 * big-numbers, savings rate, and a per-lever table. Extracted from the
 * progress-html shell for SRP and to stay under 800 lines.
 *
 * Imitates progress-panels.ts pattern: pure string function, esc() for XSS,
 * zero external deps. Consumed by progress-html.ts (or served directly).
 * Composes with: economy-snapshot.ts (EconomySnapshot CT1).
 */

import type { EconomySnapshot } from '../economy-snapshot.js'
import type { LeverSummary } from '../../economy/economy-lever-ledger.js'

function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}

function bigNumber(id: string, label: string, value: string): string {
  return `<div class="card"><div class="big-number" id="${id}">${esc(value)}</div><div class="muted">${esc(label)}</div></div>`
}

function leverRow(lever: LeverSummary): string {
  return `<tr><td>${esc(lever.lever)}</td><td>${esc(lever.totalSaved.toLocaleString())}</td><td>${esc(lever.count)}</td></tr>`
}

/** Render the full economy panel HTML fragment. Pure, no side effects. */
export function renderEconomyView(snapshot: EconomySnapshot): string {
  const { totals, savingsRate, levers } = snapshot
  const sorted = [...levers].sort((a, b) => b.totalSaved - a.totalSaved)

  const bigNumbers = [
    bigNumber('tokensIn', 'Tokens entrada', totals.tokensIn.toLocaleString()),
    bigNumber('tokensOut', 'Tokens saída', totals.tokensOut.toLocaleString()),
    bigNumber('cache', 'Cache hits', totals.cache.toLocaleString()),
    bigNumber('cost', 'Custo USD', `$${totals.costUsd.toFixed(4)}`),
  ].join('\n')

  const leverTable =
    sorted.length === 0
      ? '<p class="muted">sem economia registrada</p>'
      : `<table>
  <thead><tr><th>Lever</th><th>Tokens poupados</th><th>Chamadas</th></tr></thead>
  <tbody>${sorted.map(leverRow).join('')}</tbody>
</table>`

  return `<section id="panel-economy" role="tabpanel" aria-labelledby="tab-economy">
  <div class="big-numbers-row">
${bigNumbers}
    <div class="card"><div class="big-number" id="savings-rate">${esc(savingsRate.toFixed(1))}%</div><div class="muted">Savings rate</div></div>
  </div>
  <div class="card lever-table">
    <h2>Levers</h2>
${leverTable}
  </div>
</section>`
}
