/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  regulateResponses,
  buildInteractionMatrix,
  applyIdiotypicRegulation,
} from '../core/immune/idiotypic-network.js'
import { DEFAULT_IDIOTYPIC_NETWORK_CONFIG } from '../core/immune/immune-types.js'
import type { TCellResponse } from '../core/immune/immune-types.js'

function makeResponse(
  overrides: Partial<TCellResponse> & { targetFile: string; actionKind: TCellResponse['actionKind'] },
): TCellResponse {
  return {
    id: `tc_test_${Math.random().toString(36).slice(2, 6)}`,
    antigenId: 'ag_test',
    targetLine: 1,
    description: 'test response',
    affinity: 0.8,
    applied: false,
    appliedAt: null,
    ...overrides,
  }
}

describe('buildInteractionMatrix', () => {
  it('creates suppressive interactions for same file + same action', () => {
    const config = DEFAULT_IDIOTYPIC_NETWORK_CONFIG
    const nodes = [
      {
        response: makeResponse({ targetFile: 'a.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:a.ts',
        concentration: 0.8,
      },
      {
        response: makeResponse({ id: 'tc_2', targetFile: 'a.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:a.ts',
        concentration: 0.8,
      },
    ]

    const interactions = buildInteractionMatrix(nodes as any, config)
    const suppressives = interactions.filter((i) => i.kind === 'suppressive')
    expect(suppressives.length).toBeGreaterThan(0)
  })

  it('creates stimulatory interactions for same file + different action', () => {
    const config = DEFAULT_IDIOTYPIC_NETWORK_CONFIG
    const nodes = [
      {
        response: makeResponse({ targetFile: 'a.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:a.ts',
        concentration: 0.8,
      },
      {
        response: makeResponse({ id: 'tc_2', targetFile: 'a.ts', actionKind: 'wrap_in_try_catch' }),
        paratope: 'act:wrap_in_try_catch',
        epitope: 'file:a.ts',
        concentration: 0.8,
      },
    ]

    const interactions = buildInteractionMatrix(nodes as any, config)
    const stimulatory = interactions.filter((i) => i.kind === 'stimulatory')
    expect(stimulatory.length).toBeGreaterThan(0)
  })

  it('creates no interactions for different files', () => {
    const config = DEFAULT_IDIOTYPIC_NETWORK_CONFIG
    const nodes = [
      {
        response: makeResponse({ targetFile: 'a.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:a.ts',
        concentration: 0.8,
      },
      {
        response: makeResponse({ id: 'tc_2', targetFile: 'b.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:b.ts',
        concentration: 0.8,
      },
    ]

    const interactions = buildInteractionMatrix(nodes as any, config)
    expect(interactions).toHaveLength(0)
  })
})

describe('applyIdiotypicRegulation', () => {
  it('reduces affinity of over-represented responses', () => {
    const config = DEFAULT_IDIOTYPIC_NETWORK_CONFIG
    const nodes = [
      {
        response: makeResponse({ targetFile: 'a.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:a.ts',
        concentration: 0.9,
      },
      {
        response: makeResponse({ id: 'tc_2', targetFile: 'a.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:a.ts',
        concentration: 0.9,
      },
    ]

    const interactions = buildInteractionMatrix(nodes as any, config)
    const regulated = applyIdiotypicRegulation(nodes as any, interactions, config)

    expect(regulated[0].concentration).toBeLessThan(nodes[0].concentration)
  })

  it('leaves solo responses unchanged', () => {
    const config = DEFAULT_IDIOTYPIC_NETWORK_CONFIG
    const nodes = [
      {
        response: makeResponse({ targetFile: 'a.ts', actionKind: 'add_typed_import' }),
        paratope: 'act:add_typed_import',
        epitope: 'file:a.ts',
        concentration: 0.8,
      },
    ]

    const interactions = buildInteractionMatrix(nodes as any, config)
    const regulated = applyIdiotypicRegulation(nodes as any, interactions, config)

    expect(regulated[0].concentration).toBe(nodes[0].concentration)
  })
})

describe('regulateResponses', () => {
  it('passes through single response unchanged', () => {
    const responses = [makeResponse({ targetFile: 'a.ts', actionKind: 'add_typed_import' })]
    const regulated = regulateResponses(responses)
    expect(regulated).toHaveLength(1)
    expect(regulated[0].affinity).toBe(responses[0].affinity)
  })

  it('reduces affinity when two responses target same file with same action', () => {
    const responses = [
      makeResponse({ targetFile: 'a.ts', actionKind: 'add_typed_import' }),
      makeResponse({ id: 'tc_2', targetFile: 'a.ts', actionKind: 'add_typed_import' }),
    ]
    const regulated = regulateResponses(responses)
    expect(regulated[0].affinity).toBeLessThan(responses[0].affinity)
  })

  it('handles empty responses', () => {
    const regulated = regulateResponses([])
    expect(regulated).toEqual([])
  })
})
