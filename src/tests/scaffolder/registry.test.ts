/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SCAFFOLD_REGISTRY, getScaffold, runScaffold } from '../../core/scaffolder/registry.js'

describe('scaffold registry — banco de combinações semânticas', () => {
  it('cataloga os 4 scaffolders com capabilities e keywords', () => {
    expect(SCAFFOLD_REGISTRY.length).toBe(4)
    for (const e of SCAFFOLD_REGISTRY) {
      expect(e.capabilities.length).toBeGreaterThan(0)
      expect(e.keywords.length).toBeGreaterThan(0)
    }
    expect(getScaffold('state-machine')).toBeDefined()
    expect(getScaffold('inexistente')).toBeUndefined()
  })

  it('runScaffold(state-machine) gera reducer + teste determinístico (0 LLM)', () => {
    const files = runScaffold('state-machine', {
      id: 'sm1',
      name: 'OrderLifecycle',
      states: ['pending', 'confirmed', 'shipped'],
      transitions: [
        { event: 'confirm', from: 'pending', to: 'confirmed' },
        { event: 'ship', from: 'confirmed', to: 'shipped' },
      ],
    })
    expect(files.length).toBe(2)
    expect(files[0].content).toContain('reduceOrderLifecycle')
    expect(files.some((f) => f.content.includes('expect('))).toBe(true)
  })

  it('runScaffold(formula) gera função pura + testes de propriedade', () => {
    const files = runScaffold('formula', {
      id: 'f1',
      name: 'calculateTotal',
      expression: 'a + b',
      domain: { a: 'Z>=0', b: 'Z>=0' },
    })
    expect(files.length).toBe(2)
    expect(files[0].content).toContain('calculateTotal')
  })
})
