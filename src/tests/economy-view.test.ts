/*!
 * Task node_dc56b2ce0a3f — economy view (HTML fragment).
 *
 * AC1: Given /api/economy with data, When view renders, Then displays 4 big-numbers
 *      (tokens in/out/cache + cost) and savings rate.
 * AC2: Given levers in payload, Then shows lever table sorted by saved desc.
 * AC3: Given empty /api/economy, Then shows 'sem economia registrada' and dynamic
 *      text is XSS-safe (esc'd).
 */

import { describe, it, expect } from 'vitest'
import { renderEconomyView } from '../core/web/views/economy-view.js'
import type { EconomySnapshot } from '../core/web/economy-snapshot.js'

const FULL_SNAPSHOT: EconomySnapshot = {
  totals: { tokensIn: 100_000, tokensOut: 20_000, cache: 5_000, saved: 30_000, costUsd: 0.42 },
  savingsRate: 12.5,
  levers: [
    { lever: 'ncd_dedup', totalSaved: 1200, count: 8 },
    { lever: 'heat_kernel', totalSaved: 3000, count: 5 },
  ],
}

const EMPTY_SNAPSHOT: EconomySnapshot = {
  totals: { tokensIn: 0, tokensOut: 0, cache: 0, saved: 0, costUsd: 0 },
  savingsRate: 0,
  levers: [],
}

describe('renderEconomyView', () => {
  it('contains 4 big-number ids and savings-rate (AC1)', () => {
    const html = renderEconomyView(FULL_SNAPSHOT)
    expect(html).toContain('id="tokensIn"')
    expect(html).toContain('id="tokensOut"')
    expect(html).toContain('id="cache"')
    expect(html).toContain('id="cost"')
    expect(html).toContain('id="savings-rate"')
  })

  it('shows lever table sorted by saved desc (AC2)', () => {
    const html = renderEconomyView(FULL_SNAPSHOT)
    expect(html).toContain('<table')
    // heat_kernel (3000) should appear before ncd_dedup (1200)
    const heatIdx = html.indexOf('heat_kernel')
    const ncdIdx = html.indexOf('ncd_dedup')
    expect(heatIdx).toBeLessThan(ncdIdx)
  })

  it('shows empty state when no levers (AC3)', () => {
    const html = renderEconomyView(EMPTY_SNAPSHOT)
    expect(html).toContain('sem economia registrada')
  })

  it('dynamic values pass through esc (no raw < > & in output) (AC3)', () => {
    const malicious: EconomySnapshot = {
      ...EMPTY_SNAPSHOT,
      levers: [{ lever: '<script>alert(1)</script>', totalSaved: 1, count: 1 }],
    }
    const html = renderEconomyView(malicious)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
