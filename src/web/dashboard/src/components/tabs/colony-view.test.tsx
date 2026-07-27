/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_31ae9dd977c5 — ColonyView: visão figurativa das trilhas de feromônio.
 * Peso visual ∝ amount, hover expõe key+amount, band agregado visível, top-K
 * com 500 trilhas, estado vazio coerente, zero cor hardcoded (só CSS vars).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ColonyView } from './colony-view'
import { COLONY_TOP_K } from '@/lib/colony-figuration'
import type { ColonyData } from '@/lib/types'

const mockUseColonyData = vi.fn()
vi.mock('@/hooks/use-colony-data', () => ({
  useColonyData: () => mockUseColonyData(),
}))

function hookState(data: ColonyData | null, overrides: Partial<Record<'loading' | 'error', unknown>> = {}) {
  return { data, loading: false, error: null, refresh: vi.fn(), ...overrides }
}

const colony: ColonyData = {
  trails: [
    { key: 'trail-strong', amount: 10, ts: 1 },
    { key: 'trail-weak', amount: 1, ts: 2 },
  ],
  entropy: { hNorm: 0.7, band: 'healthy' },
}

describe('ColonyView', () => {
  beforeEach(() => {
    mockUseColonyData.mockReset()
  })

  it('renders each trail with visual weight proportional to amount (AC1) and hover title key+amount (AC3)', () => {
    mockUseColonyData.mockReturnValue(hookState(colony))
    const { container } = render(<ColonyView />)

    const strong = container.querySelector('[data-trail="trail-strong"]')
    const weak = container.querySelector('[data-trail="trail-weak"]')
    expect(strong).not.toBeNull()
    expect(weak).not.toBeNull()
    expect(Number(strong?.getAttribute('stroke-width'))).toBeGreaterThan(Number(weak?.getAttribute('stroke-width')))
    // hover: <title> nativo carrega key + amount
    expect(strong?.querySelector('title')?.textContent).toContain('trail-strong')
    expect(strong?.querySelector('title')?.textContent).toContain('10')
    // band agregado visível (AC3)
    expect(screen.getByText(/healthy/i)).toBeInTheDocument()
  })

  it('caps rendering at top-K with 500 trails (AC2)', () => {
    const many: ColonyData = {
      trails: Array.from({ length: 500 }, (_, i) => ({ key: `t${i}`, amount: i + 1, ts: 1 })),
      entropy: { hNorm: 0.5, band: 'healthy' },
    }
    mockUseColonyData.mockReturnValue(hookState(many))
    const { container } = render(<ColonyView />)
    expect(container.querySelectorAll('[data-trail]')).toHaveLength(COLONY_TOP_K)
  })

  it('uses only theme CSS vars — no hardcoded hex/rgb colors (AC4)', () => {
    mockUseColonyData.mockReturnValue(hookState(colony))
    const { container } = render(<ColonyView />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    const inline = svg?.outerHTML ?? ''
    expect(inline).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(inline).not.toMatch(/rgb\(/)
  })

  it('renders a themed empty state without crashing when there are no trails (AC5)', () => {
    mockUseColonyData.mockReturnValue(hookState({ trails: [], entropy: { hNorm: 0, band: 'unknown' } }))
    render(<ColonyView />)
    expect(screen.getByText(/no pheromone trails/i)).toBeInTheDocument()
  })

  it('shows the error state when the hook exposes an error (AC5/limite)', () => {
    mockUseColonyData.mockReturnValue(hookState(null, { error: 'colony down' }))
    render(<ColonyView />)
    expect(screen.getByRole('alert')).toHaveTextContent('colony down')
  })
})
