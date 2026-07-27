/*!
 * TDD: cross-language scaffold guard.
 *
 * AC1: Go project → decideScaffold only considers language=go scaffolds.
 * AC2: agf done with .py file → mine-on-done saves descriptor with language=python.
 * AC3: Rust project → only language=rust candidates.
 */

import { describe, it, expect } from 'vitest'
import { decideScaffold } from '../core/rag-out/gate.js'
import type { ScaffoldDescriptor } from '../core/rag-out/gate.js'
import { inferLanguageFromFiles } from '../core/rag-out/mine-on-done.js'
import { mineScaffoldCandidates } from '../core/rag-out/mining.js'

const tsScaffold: ScaffoldDescriptor = {
  id: 'ts-handler',
  goal: 'add http handler',
  fitTags: ['handler', 'http'],
  slots: ['name'],
  noveltyFloor: 0.3,
  language: 'typescript',
}

const goScaffold: ScaffoldDescriptor = {
  id: 'go-handler',
  goal: 'add http handler',
  fitTags: ['handler', 'http'],
  slots: ['name'],
  noveltyFloor: 0.3,
  language: 'go',
}

const rustScaffold: ScaffoldDescriptor = {
  id: 'rust-fn',
  goal: 'add async function',
  fitTags: ['async', 'function'],
  slots: ['name'],
  noveltyFloor: 0.3,
  language: 'rust',
}

describe('decideScaffold — language guard (AC1 + AC3)', () => {
  const corpus = [tsScaffold, goScaffold, rustScaffold]

  it('Go project: only go scaffolds are candidates (AC1)', () => {
    const result = decideScaffold('add http handler', corpus, { projectLanguage: 'go' })
    // If best is a match, it must be go
    if (result.best) {
      expect(result.best.language).toBe('go')
    }
    // TS scaffold must not appear in candidates as a winner
    const tsWon = result.candidates.find((c) => c.scaffold.language === 'typescript' && c.score > 0.5)
    expect(tsWon).toBeUndefined()
  })

  it('Rust project: only rust scaffolds are candidates (AC3)', () => {
    const result = decideScaffold('add async function', corpus, { projectLanguage: 'rust' })
    if (result.best) {
      expect(result.best.language).toBe('rust')
    }
    const tsWon = result.candidates.find((c) => c.scaffold.language === 'typescript' && c.score > 0.5)
    expect(tsWon).toBeUndefined()
  })

  it('TS scaffold is never recovered for a Go project even with high similarity', () => {
    const result = decideScaffold('add http handler', corpus, { projectLanguage: 'go', threshold: 0.1 })
    expect(result.best?.language).not.toBe('typescript')
  })
})

describe('inferLanguageFromFiles — language detection from artifact paths (AC2)', () => {
  it('detects python from .py file', () => {
    expect(inferLanguageFromFiles(['src/auth/login.py'])).toBe('python')
  })

  it('detects go from .go file', () => {
    expect(inferLanguageFromFiles(['pkg/server/handler.go'])).toBe('go')
  })

  it('detects rust from .rs file', () => {
    expect(inferLanguageFromFiles(['src/main.rs'])).toBe('rust')
  })

  it('detects typescript from .ts file', () => {
    expect(inferLanguageFromFiles(['src/index.ts'])).toBe('typescript')
  })

  it('returns unknown for no files', () => {
    expect(inferLanguageFromFiles([])).toBe('unknown')
  })
})

describe('mineScaffoldCandidates — language propagation (AC2)', () => {
  it('candidate inherits language when provided', () => {
    const goals = ['add http handler in go', 'add http handler in go', 'add http handler in go']
    const candidates = mineScaffoldCandidates(goals, { language: 'go' })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].language).toBe('go')
  })
})
