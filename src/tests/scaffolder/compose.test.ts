/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { rankScaffolds } from '../../core/scaffolder/retrieve-rank.js'
import { composeScaffoldPlan, readScaffoldMeta } from '../../core/scaffolder/compose.js'

describe('retrieve-rank — ranking lexical determinístico', () => {
  it('ranqueia state-machine acima quando o requisito fala de estados/transições', () => {
    const ranked = rankScaffolds({
      title: 'Order lifecycle state machine',
      description: 'reducer with transitions between status',
      acceptanceCriteria: ['from pending on confirm to confirmed'],
    })
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0].kind).toBe('state-machine')
  })

  it('é determinístico (mesma entrada → mesma ordem)', () => {
    const node = { title: 'rest endpoint handler with validation' }
    const a = rankScaffolds(node).map((r) => r.kind)
    const b = rankScaffolds(node).map((r) => r.kind)
    expect(a).toEqual(b)
    expect(a[0]).toBe('contract')
  })
})

describe('compose — set-cover (CLRS §35.3) combina N scaffolds', () => {
  it('spec único explícito → plano de 1 item, cobertura total', () => {
    const node = {
      metadata: { scaffold: { kind: 'state-machine', spec: { id: 's', name: 'X', states: [], transitions: [] } } },
    }
    const plan = composeScaffoldPlan(node, [])
    expect(plan.items.length).toBe(1)
    expect(plan.items[0].kind).toBe('state-machine')
    expect(plan.uncovered).toEqual([])
  })

  it('composição cobre as capacidades exigidas com o conjunto mínimo', () => {
    // requires cobre caps de contract (input-validation) + state-machine (state-reducer)
    const node = {
      metadata: {
        scaffold: {
          requires: ['input-validation', 'state-reducer'],
          specs: {
            contract: { id: 'c', name: 'H', inputSchemaRef: 'In', outputSchemaRef: null, handlerType: 'rest' },
            'state-machine': {
              id: 's',
              name: 'SM',
              states: ['a', 'b'],
              transitions: [{ event: 'go', from: 'a', to: 'b' }],
            },
          },
        },
      },
    }
    const ranked = rankScaffolds({ title: 'contract state machine' })
    const plan = composeScaffoldPlan(node, ranked)
    const kinds = plan.items.map((i) => i.kind).sort()
    expect(kinds).toContain('contract')
    expect(kinds).toContain('state-machine')
    expect(plan.uncovered).toEqual([])
  })

  it('capacidade não coberta pelo corpus → reason creative-edge', () => {
    const node = {
      metadata: {
        scaffold: {
          requires: ['input-validation', 'quantum-teleport'],
          specs: { contract: { id: 'c', name: 'H', inputSchemaRef: 'In', outputSchemaRef: null, handlerType: 'rest' } },
        },
      },
    }
    const plan = composeScaffoldPlan(node, [])
    expect(plan.uncovered).toContain('quantum-teleport')
    expect(plan.reason).toBe('creative-edge')
  })

  it('node sem metadata.scaffold → needs-llm (nunca lança)', () => {
    expect(readScaffoldMeta({ metadata: {} })).toBeNull()
    const plan = composeScaffoldPlan({ metadata: {} }, [])
    expect(plan.reason).toBe('needs-llm')
    expect(plan.items).toEqual([])
  })
})
