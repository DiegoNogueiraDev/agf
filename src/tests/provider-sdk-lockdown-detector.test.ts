import { describe, it, expect } from 'vitest'
import { detectViolations, FORBIDDEN_SDKS } from '../core/hooks/provider-sdk-lockdown-detector.js'

describe('detectViolations', () => {
  it('returns empty array for clean files', () => {
    const files = [{ path: 'src/core/utils/foo.ts', content: 'export const x = 1' }]
    expect(detectViolations(files)).toHaveLength(0)
  })

  it('detects import from openai', () => {
    const files = [
      {
        path: 'src/core/service.ts',
        content: 'import { OpenAI } from "openai"',
      },
    ]
    const violations = detectViolations(files)
    expect(violations).toHaveLength(1)
    expect(violations[0].sdk).toBe('openai')
    expect(violations[0].pattern).toBe('import/export from')
  })

  it('detects import from @anthropic-ai/sdk', () => {
    const files = [
      {
        path: 'src/worker.ts',
        content: `import Anthropic from '@anthropic-ai/sdk'`,
      },
    ]
    const violations = detectViolations(files)
    expect(violations).toHaveLength(1)
    expect(violations[0].sdk).toBe('@anthropic-ai/sdk')
  })

  it('detects require() calls', () => {
    const files = [
      {
        path: 'src/legacy.js',
        content: `const groq = require('groq-sdk')`,
      },
    ]
    const violations = detectViolations(files)
    expect(violations).toHaveLength(1)
    expect(violations[0].sdk).toBe('groq-sdk')
    expect(violations[0].pattern).toBe('require')
  })

  it('exempts files in allowed adapters path', () => {
    const files = [
      {
        path: 'src/core/llm/adapters/openai-adapter.ts',
        content: 'import { OpenAI } from "openai"',
      },
    ]
    expect(detectViolations(files)).toHaveLength(0)
  })

  it('reports correct line number', () => {
    const files = [
      {
        path: 'src/svc.ts',
        content: `const x = 1\nimport { OpenAI } from "openai"\n`,
      },
    ]
    const violations = detectViolations(files)
    expect(violations[0].line).toBe(2)
  })

  it('FORBIDDEN_SDKS constant is non-empty', () => {
    expect(FORBIDDEN_SDKS.length).toBeGreaterThan(0)
  })
})
