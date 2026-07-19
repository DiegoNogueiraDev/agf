/*!
 * Tests for agf lint-files command.
 * Verifies source-only semantics, exit code, and --staged flag behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkFileSizeCompliance, MAX_FILE_LINES } from '../core/harness/fitness-functions.js'
import { buildLintFilesPayload } from '../cli/commands/lint-files-cmd.js'

describe('buildLintFilesPayload', () => {
  it('returns violations for source files over MAX_FILE_LINES', () => {
    const bigContent = 'x\n'.repeat(MAX_FILE_LINES + 1)
    const files = [{ path: 'src/foo.ts', content: bigContent }]
    const result = buildLintFilesPayload(files)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].file).toBe('src/foo.ts')
    expect(result.violations[0].lines).toBeGreaterThan(MAX_FILE_LINES)
    expect(result.ok).toBe(false)
  })

  it('returns empty violations when all files are within limit', () => {
    const okContent = 'x\n'.repeat(MAX_FILE_LINES - 1)
    const files = [{ path: 'src/bar.ts', content: okContent }]
    const result = buildLintFilesPayload(files)
    expect(result.violations).toHaveLength(0)
    expect(result.ok).toBe(true)
  })

  it('flags oversized non-JS/TS source files (.py, .go, .rs) — language-agnostic 800-line rule', () => {
    const bigContent = 'x\n'.repeat(MAX_FILE_LINES + 1)
    const files = [
      { path: 'core/agent_loop.py', content: bigContent },
      { path: 'pkg/server.go', content: bigContent },
      { path: 'src/lib.rs', content: bigContent },
    ]
    const result = buildLintFilesPayload(files)
    expect(result.violations.map((v) => v.file).sort()).toEqual(['core/agent_loop.py', 'pkg/server.go', 'src/lib.rs'])
    expect(result.ok).toBe(false)
  })

  it('skips non-source files (.json, .md, .txt)', () => {
    const bigContent = 'x\n'.repeat(MAX_FILE_LINES + 100)
    const files = [
      { path: 'data/big.json', content: bigContent },
      { path: 'README.md', content: bigContent },
      { path: 'notes.txt', content: bigContent },
    ]
    const result = buildLintFilesPayload(files)
    expect(result.violations).toHaveLength(0)
    expect(result.ok).toBe(true)
  })

  it('skips generated files (.generated.ts)', () => {
    const bigContent = 'x\n'.repeat(MAX_FILE_LINES + 100)
    const files = [{ path: 'src/schema.generated.ts', content: bigContent }]
    const result = buildLintFilesPayload(files)
    expect(result.violations).toHaveLength(0)
    expect(result.ok).toBe(true)
  })

  it('handles mixed files — only source violations reported', () => {
    const bigContent = 'x\n'.repeat(MAX_FILE_LINES + 1)
    const files = [
      { path: 'src/big.ts', content: bigContent },
      { path: 'data/big.json', content: bigContent },
      { path: 'src/ok.ts', content: 'hello\n' },
    ]
    const result = buildLintFilesPayload(files)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].file).toBe('src/big.ts')
  })

  describe('provider-sdk-lockdown-detector integration (node_wire_be79e06aff65)', () => {
    it('flags a forbidden provider SDK import outside the adapters allowlist', () => {
      const files = [{ path: 'src/core/llm/some-file.ts', content: `import OpenAI from 'openai'\n` }]
      const result = buildLintFilesPayload(files)
      expect(result.ok).toBe(false)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].file).toBe('src/core/llm/some-file.ts')
      expect(result.violations[0].rule).toBe('provider-sdk-lockdown:openai')
    })

    it('allows forbidden SDK imports inside the adapters allowlist directory', () => {
      const files = [{ path: 'src/core/llm/adapters/openai-adapter.ts', content: `import OpenAI from 'openai'\n` }]
      const result = buildLintFilesPayload(files)
      expect(result.ok).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('does not flag allowed imports', () => {
      const files = [{ path: 'src/core/llm/router.ts', content: `import { z } from 'zod'\n` }]
      const result = buildLintFilesPayload(files)
      expect(result.ok).toBe(true)
    })

    it('combines file-size and SDK-lockdown violations in one payload', () => {
      const bigContent = 'x\n'.repeat(MAX_FILE_LINES + 1)
      const files = [
        { path: 'src/big.ts', content: bigContent },
        { path: 'src/core/llm/uses-anthropic.ts', content: `import Anthropic from '@anthropic-ai/sdk'\n` },
      ]
      const result = buildLintFilesPayload(files)
      expect(result.ok).toBe(false)
      expect(result.violations).toHaveLength(2)
      expect(result.violations.some((v) => v.rule.includes('line limit'))).toBe(true)
      expect(result.violations.some((v) => v.rule === 'provider-sdk-lockdown:@anthropic-ai/sdk')).toBe(true)
    })
  })
})
