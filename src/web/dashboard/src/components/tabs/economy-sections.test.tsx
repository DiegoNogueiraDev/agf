/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { formatInt, formatBytes, BigNumber, DelegatePanel, CachePanel } from './economy-sections'
import type { DelegateEconomyView, CommandEconomyView, CacheEconomyView } from '@/lib/types'

describe('formatInt', () => {
  it('formats with locale thousands separators', () => {
    expect(formatInt(1000)).toBe((1000).toLocaleString())
    expect(formatInt(0)).toBe('0')
  })
})

describe('formatBytes', () => {
  it('formats sub-1KB values as bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats sub-1MB values as KB with one decimal', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('formats large values as MB with one decimal', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('<BigNumber>', () => {
  it('renders label, value, and optional sub text', () => {
    render(<BigNumber label="Tokens" value="1,234" sub="this session" />)
    expect(screen.getByText('Tokens')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('this session')).toBeInTheDocument()
  })

  it('omits the sub line when not provided', () => {
    render(<BigNumber label="Cost" value="$0.05" />)
    expect(screen.queryByText('this session')).toBeNull()
  })
})

describe('<DelegatePanel>', () => {
  const delegate: DelegateEconomyView = {
    cmdCalls: 42,
    cmdTok: 1000,
    baselineTok: 5000,
    baselineBytes: 20000,
    delegateSaved: 4000,
    savedPct: 80,
    avgTokPerCmd: 24,
    baselineExtrapolated: false,
  }
  const commands: CommandEconomyView = {
    calls: 42,
    estimatedTokens: 1000,
    graphExportBytes: 2048,
    avgDurationMs: 123,
  }

  it('renders the section with an accessible label', () => {
    render(<DelegatePanel delegate={delegate} commands={commands} />)
    expect(screen.getByRole('region', { name: 'Delegate economy' })).toBeInTheDocument()
  })

  it('shows the saved percentage and call count', () => {
    render(<DelegatePanel delegate={delegate} commands={commands} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('marks the baseline as estimated when baselineExtrapolated is true', () => {
    render(<DelegatePanel delegate={{ ...delegate, baselineExtrapolated: true }} commands={commands} />)
    expect(screen.getByText(/\(est\.\)/)).toBeInTheDocument()
  })
})

describe('<CachePanel>', () => {
  it('renders without throwing for a zero-activity cache (delegate-first default)', () => {
    const cache: CacheEconomyView = {
      hitRate: 0,
      totalHits: 0,
      totalMisses: 0,
      tokensSaved: 0,
      estimatedSavingsUsd: 0,
    }
    expect(() => render(<CachePanel cache={cache} />)).not.toThrow()
  })
})
