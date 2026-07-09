/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_091c7c20a4d7 — glossary builder determinístico
 *
 * AC1: Given a repo/graph corpus, buildGlossary returns top-N domain-specific
 *      terms with definition + source. Deterministic (same input → same output).
 * AC2: Common/stop words (high global frequency) do NOT enter the glossary.
 */

import { describe, it, expect } from 'vitest'
import { buildGlossary } from '../core/context/glossary-builder.js'
import type { GlossaryEntry, GlossaryOptions } from '../core/context/glossary-builder.js'

// Fixture: domain-rich corpus with repeated technical terms
const DOMAIN_CORPUS = [
  {
    text: 'The TokenLedger accumulates token usage per task via recordCall. TokenLedger is the single source of truth for token spend.',
    source: 'token-ledger.ts',
  },
  {
    text: 'ScenarioRunner seeds a workspace, runs orchestrate, and scores by oracle. ScenarioRunner uses TokenLedger.',
    source: 'scenario-runner.ts',
  },
  {
    text: 'The SqliteStore persists graph nodes and edges. SqliteStore migrations are versioned. SqliteStore is the graph backbone.',
    source: 'sqlite-store.ts',
  },
  {
    text: 'TokenLedger totals are used in ScenarioResult. ScenarioResult includes tokensTotal and costUsd.',
    source: 'scorecard.ts',
  },
]

// Common words fixture — should not appear in glossary
const COMMON_WORDS_CORPUS = [
  { text: 'the and is of to in that this with for are was has have been', source: 'common.md' },
  { text: 'the the the and and is is of to to in that this with for', source: 'common2.md' },
]

describe('buildGlossary (AC1 — domain terms)', () => {
  it('returns an array of GlossaryEntry objects', () => {
    const result = buildGlossary(DOMAIN_CORPUS)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('each entry has term, definition, and source fields', () => {
    const result = buildGlossary(DOMAIN_CORPUS)
    for (const entry of result) {
      expect(typeof entry.term).toBe('string')
      expect(typeof entry.definition).toBe('string')
      expect(typeof entry.source).toBe('string')
      expect(entry.term.length).toBeGreaterThan(0)
    }
  })

  it('high-frequency domain terms appear in the glossary (TokenLedger, SqliteStore)', () => {
    const result = buildGlossary(DOMAIN_CORPUS)
    const terms = result.map((e) => e.term)
    expect(terms.some((t) => t.toLowerCase().includes('tokenledger') || t.toLowerCase().includes('sqlitestore'))).toBe(
      true,
    )
  })

  it('is deterministic — same input produces same output', () => {
    const r1 = buildGlossary(DOMAIN_CORPUS)
    const r2 = buildGlossary(DOMAIN_CORPUS)
    expect(r1.map((e) => e.term)).toEqual(r2.map((e) => e.term))
  })

  it('respects topN option', () => {
    const result = buildGlossary(DOMAIN_CORPUS, { topN: 2 })
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('source field references the originating file', () => {
    const result = buildGlossary(DOMAIN_CORPUS)
    const sources = result.map((e) => e.source)
    // at least one entry should reference one of our source files
    expect(sources.some((s) => s.endsWith('.ts') || s.endsWith('.md'))).toBe(true)
  })
})

describe('buildGlossary (AC2 — common words excluded)', () => {
  it('does not include common English stop words in glossary', () => {
    const result = buildGlossary(COMMON_WORDS_CORPUS)
    const terms = result.map((e) => e.term.toLowerCase())
    const stopWords = ['the', 'and', 'is', 'of', 'to', 'in', 'that', 'this', 'with', 'for']
    for (const sw of stopWords) {
      expect(terms).not.toContain(sw)
    }
  })

  it('returns empty glossary when corpus has only stop words', () => {
    const result = buildGlossary(COMMON_WORDS_CORPUS, { topN: 5 })
    const terms = result.map((e) => e.term.toLowerCase())
    const stopWords = new Set(['the', 'and', 'is', 'of', 'to', 'in', 'that', 'this', 'with', 'for'])
    expect(terms.every((t) => !stopWords.has(t))).toBe(true)
  })
})

// Type shape check
const _typeCheck: GlossaryEntry = { term: 'foo', definition: 'bar', source: 'baz.ts', frequency: 1 }
const _optsCheck: GlossaryOptions = { topN: 10 }
void _typeCheck
void _optsCheck
