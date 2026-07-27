import { describe, it, expect } from 'vitest'
import { decideScaffold } from '../core/rag-out/gate.js'
import type { ScaffoldDescriptor } from '../core/rag-out/gate.js'

const corpus: ScaffoldDescriptor[] = [
  {
    id: 'rest-contract',
    goal: 'REST handler with zod validation and error handling',
    fitTags: ['rest', 'handler', 'http', 'zod', 'validation', 'contract', 'endpoint', 'api'],
    slots: ['route', 'method', 'requestSchema', 'responseSchema'],
    noveltyFloor: 0.5,
  },
  {
    id: 'state-machine',
    goal: 'reducer state machine with exhaustive transitions',
    fitTags: ['reducer', 'state', 'machine', 'transition', 'fsm', 'switch'],
    slots: ['states', 'events', 'transitions'],
    noveltyFloor: 0.6,
  },
  {
    id: 'pure-formula',
    goal: 'pure function with property-based tests',
    fitTags: ['formula', 'pure', 'function', 'calculation', 'property'],
    slots: ['inputs', 'output', 'invariants'],
    noveltyFloor: 0.9, // very high bar: only recover when the goal is almost identical
  },
]

describe('decideScaffold (recover-vs-generate gate)', () => {
  it('recovers a scaffold when the goal fits well above the bar', () => {
    const d = decideScaffold('build a REST endpoint handler with zod validation', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('rest-contract')
    expect(d.confidence).toBeGreaterThanOrEqual(0.5)
    expect(d.best?.slots).toContain('requestSchema')
  })

  it('generates when the goal is far from every scaffold', () => {
    const d = decideScaffold('write a haiku about the ocean', corpus)
    expect(d.decision).toBe('generate')
  })

  it('generates when fit is below the scaffold-specific novelty_floor (avoid wrong recovery)', () => {
    // touches the formula scaffold weakly (its floor is 0.9) → must generate, not force it
    const d = decideScaffold('a pure helper', corpus, { threshold: 0.1 })
    expect(d.decision).toBe('generate')
    expect(d.reason).toMatch(/novelty_floor|floor|below/i)
  })

  it('respects a custom global threshold (partial-coverage goal)', () => {
    // extra terms not in any scaffold → coverage < 0.99 → generate under strict bar
    const strict = decideScaffold('REST endpoint handler with caching and retries and tracing', corpus, {
      threshold: 0.99,
    })
    expect(strict.decision).toBe('generate')
    expect(strict.reason).toMatch(/threshold/i)
  })

  it('generates (no throw) for an empty corpus', () => {
    const d = decideScaffold('anything at all', [])
    expect(d.decision).toBe('generate')
    expect(d.best).toBeNull()
    expect(d.reason).toMatch(/no.?scaffold|empty/i)
  })

  it('corpusSignals ausente/vazio ({}) → confiança idêntica à chamada sem corpusSignals (node_b3cca8d17450)', () => {
    const withoutSignals = decideScaffold('build a REST endpoint handler with zod validation', corpus)
    const withEmptySignals = decideScaffold('build a REST endpoint handler with zod validation', corpus, {
      corpusSignals: {},
    })
    expect(withEmptySignals.confidence).toBe(withoutSignals.confidence)
    expect(withEmptySignals.best?.id).toBe(withoutSignals.best?.id)
  })

  it('corpusSignals desempata um fit-score exatamente igual entre dois candidatos (node_b3cca8d17450)', () => {
    const tiedCorpus: ScaffoldDescriptor[] = [
      {
        id: 'contract',
        goal: 'contrato de tipo para uma fronteira de módulo',
        fitTags: ['contract', 'boundary', 'shape'],
        slots: ['fields'],
        noveltyFloor: 0.1,
      },
      {
        id: 'interface',
        goal: 'contrato de tipo para uma fronteira de módulo',
        fitTags: ['contract', 'boundary', 'shape'],
        slots: ['fields'],
        noveltyFloor: 0.1,
      },
    ]
    const goal = 'contrato de tipo para uma fronteira de módulo'
    // Sem sinal: empate exato entre os dois — ordem original (menor índice) vence.
    const noSignal = decideScaffold(goal, tiedCorpus)
    expect(noSignal.best?.id).toBe('contract')

    // Com sinal favorecendo 'interface': o desempate vira 'interface'.
    const withSignal = decideScaffold(goal, tiedCorpus, { corpusSignals: { interface: 3 } })
    expect(withSignal.best?.id).toBe('interface')
  })

  it('never recovers a scaffold that is not in the corpus', () => {
    const d = decideScaffold('reducer state machine with transitions', corpus)
    if (d.best) expect(corpus.some((s) => s.id === d.best!.id)).toBe(true)
  })
})
