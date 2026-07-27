import { describe, it, expect } from 'vitest'
import {
  SandboxStackSchema,
  SandboxIsolationModeSchema,
  SandboxBuilderConfigSchema,
  IsolationGuaranteeSchema,
  FingerprintStrategySchema,
  BuildPhaseSchema,
  KillSignalSchema,
} from '../core/sandbox/sandbox-architecture.js'

describe('SandboxStackSchema', () => {
  it('accepts valid stacks', () => {
    for (const v of ['maven', 'gradle', 'npm', 'go', 'pip', 'auto'] as const) {
      expect(SandboxStackSchema.safeParse(v).success).toBe(true)
    }
  })

  it('rejects unknown stack', () => {
    expect(SandboxStackSchema.safeParse('ruby').success).toBe(false)
  })
})

describe('SandboxIsolationModeSchema', () => {
  it('accepts docker, podman, process, auto', () => {
    for (const v of ['docker', 'podman', 'process', 'auto'] as const) {
      expect(SandboxIsolationModeSchema.safeParse(v).success).toBe(true)
    }
  })
})

describe('IsolationGuaranteeSchema', () => {
  it('accepts strong and weak', () => {
    expect(IsolationGuaranteeSchema.safeParse('strong').success).toBe(true)
    expect(IsolationGuaranteeSchema.safeParse('weak').success).toBe(true)
  })
})

describe('FingerprintStrategySchema', () => {
  it('accepts content-hash, command-hash, none', () => {
    for (const v of ['content-hash', 'command-hash', 'none'] as const) {
      expect(FingerprintStrategySchema.safeParse(v).success).toBe(true)
    }
  })
})

describe('BuildPhaseSchema', () => {
  it('accepts compile, test, lint, report', () => {
    for (const v of ['compile', 'test', 'lint', 'report'] as const) {
      expect(BuildPhaseSchema.safeParse(v).success).toBe(true)
    }
  })
})

describe('KillSignalSchema', () => {
  it('accepts SIGKILL and SIGTERM', () => {
    expect(KillSignalSchema.safeParse('SIGKILL').success).toBe(true)
    expect(KillSignalSchema.safeParse('SIGTERM').success).toBe(true)
  })
})

describe('SandboxBuilderConfigSchema', () => {
  it('rejects empty object (missing required fields)', () => {
    expect(SandboxBuilderConfigSchema.safeParse({}).success).toBe(false)
  })
})
