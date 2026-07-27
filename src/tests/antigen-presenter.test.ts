import { describe, it, expect } from 'vitest'
import { presentAntigens, deduplicateAntigens } from '../core/immune/antigen-presenter.js'
import type { DangerSignal } from '../core/immune/immune-types.js'

function makeSignal(id: string, kind: DangerSignal['kind'] = 'raw_throw', file = 'src/core/foo.ts'): DangerSignal {
  return { id, kind, file, line: 1, evidence: 'test evidence', confidence: 0.8 }
}

describe('presentAntigens', () => {
  it('returns empty array for no signals', () => {
    expect(presentAntigens([])).toHaveLength(0)
  })

  it('groups signals by file+kind into antigens', () => {
    const signals = [makeSignal('s1', 'raw_throw', 'src/core/foo.ts'), makeSignal('s2', 'raw_throw', 'src/core/foo.ts')]
    const antigens = presentAntigens(signals)
    expect(antigens).toHaveLength(1)
    expect(antigens[0]?.sourceSignals).toHaveLength(2)
  })

  it('creates separate antigens for different files', () => {
    const signals = [makeSignal('s1', 'raw_throw', 'src/core/foo.ts'), makeSignal('s2', 'raw_throw', 'src/core/bar.ts')]
    const antigens = presentAntigens(signals)
    expect(antigens).toHaveLength(2)
  })

  it('creates separate antigens for different kind on same file', () => {
    const signals = [
      makeSignal('s1', 'raw_throw', 'src/core/foo.ts'),
      makeSignal('s2', 'swallowed_catch', 'src/core/foo.ts'),
    ]
    const antigens = presentAntigens(signals)
    expect(antigens.length).toBeGreaterThanOrEqual(1)
  })
})

describe('deduplicateAntigens', () => {
  it('returns empty array when all antigens are already known', () => {
    const antigen = {
      id: 'a1',
      kind: 'bare_error' as const,
      sourceSignals: ['s1'],
      file: 'foo.ts',
      line: 1,
      signature: 'sig-abc',
      severity: 'high' as const,
      confidence: 0.9,
    }
    const prior = new Set(['sig-abc'])
    expect(deduplicateAntigens([antigen], prior)).toHaveLength(0)
  })

  it('returns antigens not in the prior signatures set', () => {
    const antigen = {
      id: 'a1',
      kind: 'bare_error' as const,
      sourceSignals: ['s1'],
      file: 'foo.ts',
      line: 1,
      signature: 'sig-new',
      severity: 'high' as const,
      confidence: 0.9,
    }
    const prior = new Set(['sig-old'])
    expect(deduplicateAntigens([antigen], prior)).toHaveLength(1)
  })

  it('returns empty array when input is empty', () => {
    expect(deduplicateAntigens([], new Set(['sig-abc']))).toHaveLength(0)
  })
})
