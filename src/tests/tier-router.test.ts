import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations/index.js'
import { recordTierEscalation } from '../core/observability/llm-call-ledger.js'
import {
  runCascade,
  tierForTask,
  isKnownModel,
  looksExternalModel,
  modelsForTier,
  resolveTierModel,
  resolveOpenRouterModel,
  extractTaskFeatures,
  computeComplexityScore,
  tierForComplexity,
  routeModelAware,
  type TaskFeatures,
  MODEL_TIERS,
  ANTHROPIC_BUILD_DEFAULT,
  DEFAULT_MODEL,
} from '../core/model-hub/tier-router.js'

describe('tierForTask', () => {
  it('returns cheap for classify task', () => {
    expect(tierForTask('classify')).toBe('cheap')
  })

  it('returns build for implement task', () => {
    expect(tierForTask('implement')).toBe('build')
  })

  it('returns frontier for plan task', () => {
    expect(tierForTask('plan')).toBe('frontier')
  })
})

describe('isKnownModel', () => {
  it('returns true for a known model in the pool', () => {
    expect(isKnownModel(ANTHROPIC_BUILD_DEFAULT)).toBe(true)
  })

  it('returns false for an unknown model', () => {
    expect(isKnownModel('nonexistent-model-xyz')).toBe(false)
  })
})

describe('looksExternalModel', () => {
  it('returns true for openrouter-style model id with slash', () => {
    expect(looksExternalModel('openai/gpt-4o')).toBe(true)
  })

  it('returns false for internal model id', () => {
    expect(looksExternalModel(ANTHROPIC_BUILD_DEFAULT)).toBe(false)
  })
})

describe('modelsForTier', () => {
  it('returns non-empty array for cheap tier', () => {
    expect(modelsForTier('cheap').length).toBeGreaterThan(0)
  })

  it('returns models with correct tier', () => {
    const models = modelsForTier('build')
    expect(models.every((m) => m.tier === 'build')).toBe(true)
  })
})

describe('resolveTierModel', () => {
  it('returns a non-empty string for each tier', () => {
    for (const tier of MODEL_TIERS) {
      expect(resolveTierModel(tier).length).toBeGreaterThan(0)
    }
  })
})

describe('resolveOpenRouterModel', () => {
  it('returns a string for each tier', () => {
    for (const tier of MODEL_TIERS) {
      expect(typeof resolveOpenRouterModel(tier)).toBe('string')
    }
  })
})

describe('constants', () => {
  it('DEFAULT_MODEL matches ANTHROPIC_BUILD_DEFAULT', () => {
    expect(DEFAULT_MODEL).toBe(ANTHROPIC_BUILD_DEFAULT)
  })
})

describe('extractTaskFeatures', () => {
  it('extracts features from context with all fields', () => {
    const ctx = {
      acceptanceCriteria: ['AC1', 'AC2', 'AC3'],
      dependsOn: [{ id: 'dep1' }, { id: 'dep2' }],
      blockers: [{ id: 'blocker1' }],
      task: { xpSize: 'L', tags: ['bug', 'security'] },
    }
    const features = extractTaskFeatures(ctx)
    expect(features.acCount).toBe(3)
    expect(features.dependencyCount).toBe(2)
    expect(features.blockerCount).toBe(1)
    expect(features.xpSize).toBe('L')
    expect(features.tags).toEqual(['bug', 'security'])
  })

  it('handles empty context gracefully', () => {
    const ctx = {}
    const features = extractTaskFeatures(ctx)
    expect(features.acCount).toBe(0)
    expect(features.dependencyCount).toBe(0)
    expect(features.blockerCount).toBe(0)
    expect(features.xpSize).toBeUndefined()
    expect(features.tags).toBeUndefined()
  })
})

describe('computeComplexityScore', () => {
  it('returns 0 for empty features', () => {
    const features: TaskFeatures = {
      acCount: 0,
      dependencyCount: 0,
      blockerCount: 0,
    }
    expect(computeComplexityScore(features)).toBe(0)
  })

  it('calculates score correctly with ACs', () => {
    const features: TaskFeatures = {
      acCount: 5,
      dependencyCount: 0,
      blockerCount: 0,
    }
    expect(computeComplexityScore(features)).toBe(10) // 5 * 2
  })

  it('calculates score correctly with dependencies', () => {
    const features: TaskFeatures = {
      acCount: 0,
      dependencyCount: 3,
      blockerCount: 0,
    }
    expect(computeComplexityScore(features)).toBe(9) // 3 * 3
  })

  it('calculates score correctly with blockers', () => {
    const features: TaskFeatures = {
      acCount: 0,
      dependencyCount: 0,
      blockerCount: 2,
    }
    expect(computeComplexityScore(features)).toBe(10) // 2 * 5
  })

  it('adds size bonus correctly', () => {
    const features: TaskFeatures = {
      acCount: 0,
      dependencyCount: 0,
      blockerCount: 0,
      xpSize: 'XL',
    }
    expect(computeComplexityScore(features)).toBe(15)
  })

  it('adds tag-based adjustments', () => {
    const features: TaskFeatures = {
      acCount: 0,
      dependencyCount: 0,
      blockerCount: 0,
      tags: ['bug', 'security', 'architecture'],
    }
    expect(computeComplexityScore(features)).toBe(12) // 3 + 5 + 4
  })

  it('combines all factors', () => {
    const features: TaskFeatures = {
      acCount: 3,
      dependencyCount: 2,
      blockerCount: 1,
      xpSize: 'M',
      tags: ['bug'],
    }
    // 3*2 + 2*3 + 1*5 + 5 + 3 = 6 + 6 + 5 + 5 + 3 = 25
    expect(computeComplexityScore(features)).toBe(25)
  })
})

describe('tierForComplexity', () => {
  it('returns cheap for low complexity', () => {
    expect(tierForComplexity(0)).toBe('cheap')
    expect(tierForComplexity(9)).toBe('cheap')
  })

  it('returns build for medium complexity', () => {
    expect(tierForComplexity(10)).toBe('build')
    expect(tierForComplexity(25)).toBe('build')
  })

  it('returns frontier for high complexity', () => {
    expect(tierForComplexity(26)).toBe('frontier')
    expect(tierForComplexity(100)).toBe('frontier')
  })
})

describe('routeModelAware', () => {
  it('returns pinned model when mode is pinned', () => {
    const config = { mode: 'pinned' as const, modelId: 'claude-opus-4-8' }
    expect(routeModelAware(config, 'classify')).toBe('claude-opus-4-8')
  })

  it('uses phase-aware routing when phase is provided', () => {
    const config = { mode: 'auto' as const }
    const model = routeModelAware(config, 'classify', 'ANALYZE')
    // ANALYZE should route to frontier
    expect(model).toBe('claude-opus-4-8')
  })

  it('uses complexity-based routing when features are provided', () => {
    const config = { mode: 'auto' as const }
    const features: TaskFeatures = {
      acCount: 10,
      dependencyCount: 5,
      blockerCount: 3,
      xpSize: 'XL',
    }
    const model = routeModelAware(config, 'classify', undefined, features)
    // High complexity should route to frontier
    expect(model).toBe('claude-opus-4-8')
  })

  it('falls back to basic routing without phase or features', () => {
    const config = { mode: 'auto' as const }
    const model = routeModelAware(config, 'classify')
    // classify should route to cheap
    expect(model).toBe('claude-haiku-4-5')
  })
})

describe('runCascade — draft barato, verifica, escala so se reprovar (A.T2 node_2c0df23446f2)', () => {
  const okVerdict = { pass: true, score: 1, reasons: [] }
  const badVerdict = { pass: false, score: 0.2, reasons: ['ac-coverage: fraco'] }

  it('AC2: draft barato aprovado => zero chamadas ao tier caro', async () => {
    // Arrange
    const calls: Record<string, number> = { haiku: 0, sonnet: 0 }
    const outcome = await runCascade({
      tiers: ['haiku', 'sonnet'],
      call: async (m) => {
        calls[m] += 1
        return { text: `resposta-${m}` }
      },
      verify: () => okVerdict,
    })

    // Assert
    expect(calls.haiku).toBe(1)
    expect(calls.sonnet).toBe(0)
    expect(outcome.tierUsed).toBe('haiku')
    expect(outcome.escalations).toBe(0)
    expect(outcome.escalationExhausted).toBe(false)
  })

  it('AC1: draft barato reprovado => exatamente 1 escalada e callback de ledger disparado', async () => {
    // Arrange
    const calls: Record<string, number> = { haiku: 0, sonnet: 0 }
    const escalations: Array<{ from: string; to: string; reason: string }> = []
    const outcome = await runCascade({
      tiers: ['haiku', 'sonnet'],
      call: async (m) => {
        calls[m] += 1
        return { text: `resposta-${m}` }
      },
      verify: (text) => (text.includes('sonnet') ? okVerdict : badVerdict),
      onEscalation: (e) => escalations.push(e),
    })

    // Assert
    expect(calls.haiku).toBe(1)
    expect(calls.sonnet).toBe(1)
    expect(outcome.escalations).toBe(1)
    expect(outcome.tierUsed).toBe('sonnet')
    expect(escalations.length).toBe(1)
    expect(escalations[0]).toMatchObject({ from: 'haiku', to: 'sonnet' })
  })

  it('AC3: maxEscalations=1 com ambos reprovando => melhor resposta, escalationExhausted, sem 3a chamada', async () => {
    // Arrange — sonnet reprova com score maior que haiku
    let totalCalls = 0
    const outcome = await runCascade({
      tiers: ['haiku', 'sonnet', 'opus'],
      maxEscalations: 1,
      call: async (m) => {
        totalCalls += 1
        return { text: `resposta-${m}` }
      },
      verify: (text) =>
        text.includes('sonnet')
          ? { pass: false, score: 0.5, reasons: ['x'] }
          : { pass: false, score: 0.2, reasons: ['x'] },
    })

    // Assert — 2 chamadas (haiku + 1 escalada), nunca opus
    expect(totalCalls).toBe(2)
    expect(outcome.escalationExhausted).toBe(true)
    expect(outcome.response).toBe('resposta-sonnet')
    expect(outcome.tierUsed).toBe('sonnet')
  })
})

describe('recordTierEscalation — linha auditavel no llm_call_ledger (A.T2)', () => {
  it('grava linha com caller tier_escalation, node_id e escalated=1', () => {
    // Arrange
    const db = new Database(':memory:')
    runMigrations(db)

    // Act
    recordTierEscalation(db, {
      sessionId: 's-casc',
      nodeId: 'node_x',
      from: 'haiku',
      to: 'sonnet',
      reason: 'verificador reprovou: ac-coverage fraco',
    })

    // Assert
    const row = db
      .prepare(`SELECT caller, node_id AS nodeId, escalated, escalation_reason AS er FROM llm_call_ledger`)
      .get() as { caller: string; nodeId: string; escalated: number; er: string }
    expect(row.caller).toBe('tier_escalation')
    expect(row.nodeId).toBe('node_x')
    expect(row.escalated).toBe(1)
    expect(row.er).toContain('reprovou')
    db.close()
  })
})
