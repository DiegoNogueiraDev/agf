import { describe, it, expect } from 'vitest'
import { buildCaseMemory, MIN_RATIONALE_LENGTH } from '../core/memory/case-distillation.js'
import type { BuildCaseMemoryInput } from '../core/memory/case-distillation.js'

function makeInput(overrides: Partial<BuildCaseMemoryInput> = {}): BuildCaseMemoryInput {
  const longRationale = 'x'.repeat(MIN_RATIONALE_LENGTH + 10)
  return {
    node: {
      id: 'n1',
      title: 'Test Task',
      type: 'task',
      priority: 1,
      tags: ['quality'],
      acceptanceCriteria: ['AC1'],
    } as any,
    grade: 'A',
    rationale: longRationale,
    testFiles: ['src/tests/foo.test.ts'],
    ...overrides,
  }
}

describe('MIN_RATIONALE_LENGTH', () => {
  it('is a positive number', () => {
    expect(MIN_RATIONALE_LENGTH).toBeGreaterThan(0)
  })
})

describe('buildCaseMemory', () => {
  it('shouldWrite=true for grade A with sufficient rationale and test files', () => {
    const result = buildCaseMemory(makeInput())
    expect(result.shouldWrite).toBe(true)
    expect(result.name).toBeDefined()
    expect(result.content).toBeDefined()
  })

  it('shouldWrite=false for grade B', () => {
    const result = buildCaseMemory(makeInput({ grade: 'B' }))
    expect(result.shouldWrite).toBe(false)
    expect(result.reason).toContain('grade=B')
  })

  it('shouldWrite=false for short rationale', () => {
    const result = buildCaseMemory(makeInput({ rationale: 'too short' }))
    expect(result.shouldWrite).toBe(false)
    expect(result.reason).toContain('rationale length')
  })

  it('shouldWrite=false for empty test files', () => {
    const result = buildCaseMemory(makeInput({ testFiles: [] }))
    expect(result.shouldWrite).toBe(false)
    expect(result.reason).toContain('no test files')
  })

  it('generated content includes node title', () => {
    const result = buildCaseMemory(makeInput())
    expect(result.content).toContain('Test Task')
  })

  it('generated name contains node id', () => {
    const result = buildCaseMemory(makeInput())
    expect(result.name).toContain('n1')
  })

  it('generated content includes test file paths', () => {
    const result = buildCaseMemory(makeInput({ testFiles: ['src/tests/bar.test.ts'] }))
    expect(result.content).toContain('src/tests/bar.test.ts')
  })
})
