import { describe, it, expect } from 'vitest'
import { detectViolations, FORBIDDEN_SDKS } from '../core/hooks/provider-sdk-lockdown-detector.js'

describe('FORBIDDEN_SDKS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(FORBIDDEN_SDKS)).toBe(true)
    expect(FORBIDDEN_SDKS.length).toBeGreaterThan(0)
    FORBIDDEN_SDKS.forEach((sdk) => expect(typeof sdk).toBe('string'))
  })
})

describe('detectViolations', () => {
  it('returns empty array for empty file list', () => {
    expect(detectViolations([])).toHaveLength(0)
  })

  it('returns empty array when no forbidden SDKs are imported', () => {
    const files = [{ path: 'src/core/foo.ts', content: 'import { z } from "zod/v4"' }]
    expect(detectViolations(files)).toHaveLength(0)
  })

  it('detects violation for forbidden SDK import', () => {
    const sdk = FORBIDDEN_SDKS[0]!
    const files = [{ path: 'src/core/bar.ts', content: `import { Client } from "${sdk}"` }]
    const violations = detectViolations(files)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]?.path).toBe('src/core/bar.ts')
    expect(violations[0]?.sdk).toBe(sdk)
  })

  it('returns empty for allowlisted adapter files', () => {
    const sdk = FORBIDDEN_SDKS[0]!
    const files = [{ path: 'src/core/llm/adapters/my-adapter.ts', content: `import { Client } from "${sdk}"` }]
    expect(detectViolations(files)).toHaveLength(0)
  })
})
