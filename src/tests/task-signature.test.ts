/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_0160dacfad38 — computeTaskSignature: assinatura estável de uma task para
 * reuso determinístico de artefatos. Pura; ordem de AC/tags não importa.
 */
import { describe, it, expect } from 'vitest'
import { computeTaskSignature } from '../core/reuse/task-signature.js'

describe('computeTaskSignature — assinatura estável (#R1)', () => {
  it('mesma task → mesma assinatura (determinística)', () => {
    const a = computeTaskSignature({ title: 'Implementar somador', acceptanceCriteria: ['soma 2+2=4'] })
    const b = computeTaskSignature({ title: 'Implementar somador', acceptanceCriteria: ['soma 2+2=4'] })
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('ordem de AC/tags é irrelevante', () => {
    const a = computeTaskSignature({
      title: 'X',
      acceptanceCriteria: ['ac1', 'ac2'],
      tags: ['t1', 't2'],
    })
    const b = computeTaskSignature({
      title: 'X',
      acceptanceCriteria: ['ac2', 'ac1'],
      tags: ['t2', 't1'],
    })
    expect(a).toBe(b)
  })

  it('título normaliza espaços/caixa', () => {
    const a = computeTaskSignature({ title: 'Implementar  Somador' })
    const b = computeTaskSignature({ title: 'implementar somador' })
    expect(a).toBe(b)
  })

  it('títulos diferentes → assinaturas diferentes', () => {
    const a = computeTaskSignature({ title: 'Somador' })
    const b = computeTaskSignature({ title: 'Multiplicador' })
    expect(a).not.toBe(b)
  })

  it('type e tags participam da assinatura', () => {
    const base = { title: 'X', acceptanceCriteria: ['a'] }
    expect(computeTaskSignature({ ...base, type: 'task' })).not.toBe(computeTaskSignature({ ...base, type: 'subtask' }))
    expect(computeTaskSignature({ ...base, tags: ['a'] })).not.toBe(computeTaskSignature({ ...base, tags: ['b'] }))
  })
})
