import { describe, it, expect } from 'vitest'
import {
  StackTypeSchema,
  IsolationModeSchema,
  ExecutionProfileSchema,
  TestFormatSchema,
  SandboxBuildInputSchema,
} from '../schemas/sandbox.schema.js'

describe('StackTypeSchema', () => {
  it('accepts all stack types', () => {
    for (const s of ['maven', 'gradle', 'npm', 'go', 'pip', 'auto']) {
      expect(StackTypeSchema.safeParse(s).success).toBe(true)
    }
  })

  it('rejects unknown stack', () => {
    expect(StackTypeSchema.safeParse('rust').success).toBe(false)
  })
})

describe('IsolationModeSchema', () => {
  it('accepts all isolation modes', () => {
    for (const m of ['docker', 'podman', 'process', 'auto']) {
      expect(IsolationModeSchema.safeParse(m).success).toBe(true)
    }
  })
})

describe('ExecutionProfileSchema', () => {
  it('accepts all profiles', () => {
    for (const p of ['ci-mirror', 'fast', 'full']) {
      expect(ExecutionProfileSchema.safeParse(p).success).toBe(true)
    }
  })
})

describe('TestFormatSchema', () => {
  it('accepts all test formats', () => {
    for (const f of ['surefire', 'jest', 'junit', 'go-test', 'auto']) {
      expect(TestFormatSchema.safeParse(f).success).toBe(true)
    }
  })
})

describe('SandboxBuildInputSchema', () => {
  it('accepts a minimal build input', () => {
    expect(
      SandboxBuildInputSchema.safeParse({
        projectDir: '/workspace/my-project',
      }).success,
    ).toBe(true)
  })

  it('accepts full build input', () => {
    expect(
      SandboxBuildInputSchema.safeParse({
        projectDir: '/workspace/my-project',
        stack: 'npm',
        isolation: 'docker',
        profile: 'ci-mirror',
      }).success,
    ).toBe(true)
  })
})
