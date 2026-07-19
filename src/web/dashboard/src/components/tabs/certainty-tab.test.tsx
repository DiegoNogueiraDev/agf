/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for the Certainty tab (node_3ecf21eea0dc, épico node_7deb314e81b0).
 * The web is the third consumer surface (CLI · CI-gate · web). The empty-state
 * guard must never swallow a real verdict: a PROVEN_INCOMPLETE with a red pillar
 * has to be VISIBLE — hiding it behind "No data" is the exact failure this tab
 * exists to prevent.
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CertaintyView } from './certainty-tab'
import type { DeliveryCertaintyPayload } from '@/lib/types'

function payload(over: Partial<DeliveryCertaintyPayload> = {}): DeliveryCertaintyPayload {
  return {
    nodeId: 'n1',
    band: 'PROVEN',
    confidence: 100,
    blockingPillars: [],
    pillars: [
      { key: 'code_on_disk', kind: 'hard', state: 'green', source: 'src/x.ts', detail: '1 file', rationale: 'why1' },
      { key: 'test_on_disk', kind: 'hard', state: 'green', source: 't', detail: 'ok', rationale: 'why2' },
      { key: 'consumer_proof', kind: 'hard', state: 'green', source: 'meta', detail: 'ok', rationale: 'why3' },
      { key: 'no_blockers', kind: 'hard', state: 'green', source: 'graph', detail: 'ok', rationale: 'why4' },
      { key: 'dod_ready', kind: 'soft', state: 'green', source: 'dod', detail: 'ok', rationale: 'why5' },
      { key: 'first_pass', kind: 'soft', state: 'green', source: 'fpy', detail: 'ok', rationale: 'why6' },
      { key: 'harness', kind: 'soft', state: 'na', source: 'harness', detail: 'n/a', rationale: 'why7' },
    ],
    ...over,
  }
}

describe('CertaintyView', () => {
  it('PROVEN → renders the band, the confidence and all 7 pillars', () => {
    render(<CertaintyView certainty={payload()} />)
    expect(screen.getByText('PROVEN')).toBeInTheDocument()
    expect(screen.getByText(/100/)).toBeInTheDocument()
    expect(screen.getAllByTestId('certainty-pillar')).toHaveLength(7)
  })

  it('PROVEN_INCOMPLETE → band and the RED pillar are visible (never hidden as "No data")', () => {
    const red = payload({
      band: 'PROVEN_INCOMPLETE',
      confidence: 38,
      blockingPillars: ['consumer_proof'],
      pillars: payload().pillars.map((p) =>
        p.key === 'consumer_proof' ? { ...p, state: 'red' as const, detail: 'sem consumer-proof' } : p,
      ),
    })
    render(<CertaintyView certainty={red} />)
    expect(screen.getByText('PROVEN_INCOMPLETE')).toBeInTheDocument()
    expect(screen.queryByText(/No data/i)).not.toBeInTheDocument()
    const blocked = screen.getByTestId('pillar-consumer_proof')
    expect(blocked).toHaveAttribute('data-state', 'red')
    expect(blocked).toHaveTextContent('consumer_proof')
  })

  it('every pillar exposes its state so red is distinguishable from na', () => {
    render(<CertaintyView certainty={payload()} />)
    expect(screen.getByTestId('pillar-harness')).toHaveAttribute('data-state', 'na')
    expect(screen.getByTestId('pillar-code_on_disk')).toHaveAttribute('data-state', 'green')
  })

  it('UNKNOWN band renders with confidence 0 and still lists the pillars', () => {
    render(<CertaintyView certainty={payload({ band: 'UNKNOWN', confidence: 0 })} />)
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
    expect(screen.getAllByTestId('certainty-pillar')).toHaveLength(7)
  })
})
