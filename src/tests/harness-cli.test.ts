import { describe, it, expect } from 'vitest'

describe('harness scan', () => {
  it('runHarnessScan produces valid result against real project without DB', async () => {
    const { runHarnessScan } = await import('../core/harness/harness-scan-runner.js')

    const result = runHarnessScan(process.cwd())

    expect(result).toBeDefined()
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.grade).toMatch(/^[ABCD]$/)
    expect(result.details).toBeInstanceOf(Array)
    expect(result.details.length).toBeGreaterThan(0)
    expect(result.timestamp).toBeDefined()
    expect(result.breakdown).toBeDefined()
  })

  it('covers all 7+ dimensions in details output', async () => {
    const { runHarnessScan } = await import('../core/harness/harness-scan-runner.js')
    const result = runHarnessScan(process.cwd())

    const dimensions = [
      'Type Coverage',
      'Test Coverage',
      'Docs Coverage',
      'Architecture Fitness',
      'Naming Clarity',
      'Error Handling',
      'Context Density',
    ]

    for (const dim of dimensions) {
      expect(
        result.details.some((d: string) => d.includes(dim)),
        `Missing dimension: ${dim}`,
      ).toBe(true)
    }
  })

  it('grade matches score ranges (A>=85, B>=70, C>=55, D<55)', async () => {
    const { runHarnessScan } = await import('../core/harness/harness-scan-runner.js')
    const result = runHarnessScan(process.cwd())

    if (result.score >= 85) expect(result.grade).toBe('A')
    else if (result.score >= 70) expect(result.grade).toBe('B')
    else if (result.score >= 55) expect(result.grade).toBe('C')
    else expect(result.grade).toBe('D')
  })
})
