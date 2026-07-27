import { describe, it, expect } from 'vitest'
import { scoreLoggingCoverage } from '../core/harness/logging-coverage-scanner.js'
import type { SourceFile } from '../core/harness/logging-coverage-scanner.js'

describe('scoreLoggingCoverage', () => {
  it('returns 100 logScore for empty file list', () => {
    const result = scoreLoggingCoverage([])
    expect(result.logScore).toBe(100)
    expect(result.total).toBe(0)
  })

  it('detects createLogger usage', () => {
    const files: SourceFile[] = [{ path: 'src/foo.ts', content: 'const log = createLogger({ layer: "core" })' }]
    const result = scoreLoggingCoverage(files)
    expect(result.logged).toBe(1)
    expect(result.dark).toHaveLength(0)
    expect(result.logScore).toBe(100)
  })

  it('flags files without logging as dark', () => {
    const files: SourceFile[] = [
      { path: 'src/a.ts', content: 'export const x = 1' },
      { path: 'src/b.ts', content: 'const log = createLogger({})' },
    ]
    const result = scoreLoggingCoverage(files)
    expect(result.dark).toContain('src/a.ts')
    expect(result.dark).not.toContain('src/b.ts')
    expect(result.logScore).toBe(50)
  })

  it('skips test files', () => {
    const files: SourceFile[] = [
      { path: 'src/foo.test.ts', content: 'export const x = 1' },
      { path: 'src/foo.spec.ts', content: 'export const y = 2' },
    ]
    const result = scoreLoggingCoverage(files)
    expect(result.total).toBe(0)
    expect(result.logScore).toBe(100)
  })

  it('detects log.info and log.warn patterns', () => {
    const files: SourceFile[] = [
      { path: 'src/svc.ts', content: 'log.info("started")' },
      { path: 'src/svc2.ts', content: 'log.warn("alert")' },
    ]
    const result = scoreLoggingCoverage(files)
    expect(result.logged).toBe(2)
    expect(result.dark).toHaveLength(0)
  })
})
