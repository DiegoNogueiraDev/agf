/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Economy tab — renders the real EconomySnapshot (totals + savings rate +
 * per-lever breakdown) from GET /api/v1/economy via apiClient.getEconomy().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TokenEconomyTab } from './token-economy-tab'
import type { EconomySnapshot } from '@/lib/types'

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getEconomy: vi.fn(),
  },
}))

const mockSnapshot: EconomySnapshot = {
  totals: { tokensIn: 12_000, tokensOut: 3_400, cache: 8_000, saved: 5_500, savedUsd: 1.2345, costUsd: 0.1234 },
  savingsRate: 35.5,
  levers: [
    { lever: 'ncd_dedup', totalSaved: 4_000, count: 12 },
    { lever: 'mdl_select', totalSaved: 1_500, count: 7 },
  ],
  delegate: {
    cmdCalls: 42,
    cmdTok: 1_000,
    baselineTok: 10_000,
    baselineBytes: 40_000,
    delegateSaved: 9_000,
    savedPct: 90,
    avgTokPerCmd: 24,
    baselineExtrapolated: false,
  },
  cache: { hitRate: 0.5, totalHits: 10, totalMisses: 10, tokensSaved: 8_000, estimatedSavingsUsd: 0.02 },
  commands: { calls: 42, estimatedTokens: 1_000, graphExportBytes: 524_288, avgDurationMs: 12 },
  byCommand: [
    { command: 'next', count: 20, savedTokens: 3_000, savingsRate: 40, avgMs: 0, lowSavings: false, impact: 'high' },
    { command: 'done', count: 22, savedTokens: 2_500, savingsRate: 30, avgMs: 0, lowSavings: false, impact: 'high' },
  ],
  scaffoldReuse: { recovered: 3, generated: 5, tokensSaved: 180, savingsRatio: 0.6 },
}

const emptySnapshot: EconomySnapshot = {
  totals: { tokensIn: 0, tokensOut: 0, cache: 0, saved: 0, savedUsd: 0, costUsd: 0 },
  savingsRate: 0,
  levers: [],
  delegate: null,
  cache: { hitRate: 0, totalHits: 0, totalMisses: 0, tokensSaved: 0, estimatedSavingsUsd: 0 },
  commands: { calls: 0, estimatedTokens: 0, graphExportBytes: 0, avgDurationMs: 0 },
  byCommand: [],
  scaffoldReuse: { recovered: 0, generated: 0, tokensSaved: 0, savingsRatio: 0 },
}

// Delegate-first project whose ONLY recorded economy is a NON_TOKEN_LEVER
// (scaffold_recovery): it never rolls into totals.saved (savings-tracker.ts:122),
// and there are no LLM calls / command ledger yet — so totals/delegate/commands
// are all zero while `levers` DOES carry real savings. This is the state the
// hasActivity gate must not read as "empty".
const leverOnlySnapshot: EconomySnapshot = {
  ...emptySnapshot,
  levers: [{ lever: 'scaffold_recovery', totalSaved: 4_891, count: 28 }],
}

// Same shape but the savings live in scaffoldReuse (RAG-OUT) rather than a lever row.
const scaffoldOnlySnapshot: EconomySnapshot = {
  ...emptySnapshot,
  scaffoldReuse: { recovered: 24, generated: 13, tokensSaved: 4_477, savingsRatio: 0.72 },
}

// Savings recorded only as per-command rows (byCommand), totals still zero.
const byCommandOnlySnapshot: EconomySnapshot = {
  ...emptySnapshot,
  byCommand: [
    { command: 'context', count: 8, savedTokens: 1_200, savingsRate: 45, avgMs: 0, lowSavings: false, impact: 'high' },
  ],
}

describe('TokenEconomyTab', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockResolvedValue(mockSnapshot)
  })

  it('renders the token/cost big numbers after loading', async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /economy/i })).toBeInTheDocument()
    })
    expect(screen.getByText('5,500')).toBeInTheDocument() // Tokens Saved
    expect(screen.getByText('$1.23')).toBeInTheDocument() // Saved ($) — savedUsd 1.2345
    expect(screen.getByText(/\$0\.1234/)).toBeInTheDocument() // Spent ($)
  })

  it('renders the savings rate', async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByText(/36%\s*savings rate/i)).toBeInTheDocument()
    })
  })

  it('renders the delegate economy section with savings percent', async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /delegate economy/i })).toBeInTheDocument()
    })
    expect(screen.getAllByText('90%').length).toBeGreaterThan(0) // delegate savedPct
  })

  it('shows an explanatory empty-state for Local Cache in delegate mode (0 hits/misses)', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockResolvedValue({
      ...mockSnapshot,
      cache: { hitRate: 0, totalHits: 0, totalMisses: 0, tokensSaved: 0, estimatedSavingsUsd: 0 },
    })
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /local cache/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/no local llm calls yet/i)).toBeInTheDocument()
  })

  it('renders the local cache section', async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /local cache/i })).toBeInTheDocument()
    })
  })

  it('renders the per-lever savings table with lever names', async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /lever savings/i })).toBeInTheDocument()
    })
    expect(screen.getAllByText('ncd_dedup').length).toBeGreaterThan(0)
    expect(screen.getAllByText('mdl_select').length).toBeGreaterThan(0)
  })

  it('shows an empty state (no crash) when there is no activity', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockResolvedValue(emptySnapshot)
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByText(/no data/i)).toBeInTheDocument()
    })
  })

  it('exposes an accessible region label for screen readers', async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /economy/i })).toBeInTheDocument()
    })
  })

  it('shows an error state when the fetch fails — not a blank screen', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockRejectedValueOnce(new Error('network failure'))
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/network failure/i)).toBeInTheDocument()
  })

  it('AC1: renders the by-command table with a row per command and a savings-rate column', async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /by.?command/i })).toBeInTheDocument()
    })
    expect(screen.getByText('next')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it("AC2: renders the scaffold reuse section with '180 tokens saved'", async () => {
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByText(/180 tokens saved/i)).toBeInTheDocument()
    })
  })

  it("AC3: shows '(est.)' in the headline when baselineExtrapolated is true", async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockResolvedValue({
      ...mockSnapshot,
      delegate: { ...mockSnapshot.delegate!, baselineExtrapolated: true },
    })
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByText(/\(est\.\)/)).toBeInTheDocument()
    })
  })

  // Regression: hasActivity must count lever/scaffold/by-command savings, not just
  // totals.saved + delegate + cache + commands. A delegate-first project whose only
  // economy is scaffold_recovery (excluded from totals.saved) was rendering "No data"
  // while real savings sat in `levers`/`scaffoldReuse` below the gate.
  it('BUG: shows lever savings (not "No data") when totals.saved is 0 but a lever has savings', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockResolvedValue(leverOnlySnapshot)
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /lever savings/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('scaffold_recovery').length).toBeGreaterThan(0)
  })

  it('BUG: shows scaffold reuse (not "No data") when the only economy is RAG-OUT recovery', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockResolvedValue(scaffoldOnlySnapshot)
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByText(/4,477 tokens saved/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument()
  })

  it('BUG: shows the by-command table (not "No data") when the only economy is per-command savings', async () => {
    const { apiClient } = await import('@/lib/api-client')
    vi.mocked(apiClient.getEconomy).mockResolvedValue(byCommandOnlySnapshot)
    render(<TokenEconomyTab />)
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /by.?command/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument()
    expect(screen.getByText('context')).toBeInTheDocument()
  })
})
