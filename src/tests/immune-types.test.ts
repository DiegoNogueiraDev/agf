import { describe, it, expect } from 'vitest'
import { DEFAULT_MUTATION_CONFIG, DEFAULT_COST_BENEFIT_CONFIG } from '../core/immune/immune-types.js'
import type {
  DangerSignalKind,
  AntigenKind,
  Severity,
  ImmuneStatus,
  DangerSignal,
  Antigen,
} from '../core/immune/immune-types.js'

describe('immune-types', () => {
  it('DangerSignalKind accepts valid values', () => {
    const k1: DangerSignalKind = 'raw_throw'
    const k2: DangerSignalKind = 'swallowed_catch'
    const k3: DangerSignalKind = 'error_rate_spike'
    expect([k1, k2, k3]).toHaveLength(3)
  })

  it('AntigenKind accepts valid values', () => {
    const k: AntigenKind = 'bare_error'
    expect(k).toBe('bare_error')
  })

  it('Severity levels include all 4 tiers', () => {
    const levels: Severity[] = ['low', 'medium', 'high', 'critical']
    expect(levels).toHaveLength(4)
  })

  it('ImmuneStatus has 5 lifecycle values', () => {
    const statuses: ImmuneStatus[] = ['detected', 'presented', 'responded', 'recovered', 'suppressed']
    expect(statuses).toHaveLength(5)
  })

  it('DEFAULT_MUTATION_CONFIG has numeric thresholds', () => {
    expect(typeof DEFAULT_MUTATION_CONFIG.mutationRate).toBe('number')
    expect(DEFAULT_MUTATION_CONFIG.maxVariantsPerAntigen).toBeGreaterThan(0)
  })

  it('DEFAULT_COST_BENEFIT_CONFIG has enabled flag and thresholds', () => {
    expect(DEFAULT_COST_BENEFIT_CONFIG.enabled).toBe(true)
    expect(typeof DEFAULT_COST_BENEFIT_CONFIG.expectedValueThreshold).toBe('number')
  })

  it('DangerSignal has expected shape', () => {
    const signal: DangerSignal = {
      id: 'sig-001',
      kind: 'raw_throw',
      file: 'src/core/foo.ts',
      line: 42,
      evidence: 'throw new Error found',
      confidence: 0.9,
    }
    expect(signal.kind).toBe('raw_throw')
    expect(signal.confidence).toBe(0.9)
  })

  it('Antigen has expected shape', () => {
    const antigen: Antigen = {
      id: 'ant-001',
      kind: 'bare_error',
      sourceSignals: ['sig-001'],
      file: 'src/core/foo.ts',
      line: 42,
      signature: 'sha256:abcdef',
      severity: 'high',
      confidence: 0.8,
    }
    expect(antigen.confidence).toBe(0.8)
    expect(antigen.sourceSignals).toHaveLength(1)
  })
})
