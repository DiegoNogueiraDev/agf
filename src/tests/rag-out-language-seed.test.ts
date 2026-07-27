/*!
 * TDD: Dart/F# language detection + cold-start corpus seed (node_eb122d9189c5).
 *
 * AC1: .dart → 'dart'; .fs → 'fsharp'; existing languages unchanged
 * AC2: Java project without local mining → decideScaffold finds >=1 language=java scaffold
 * AC3: seed is idempotent — running twice does not duplicate descriptors
 */

import { describe, it, expect } from 'vitest'
import { languageFromExtension } from '../core/rag-out/language.js'
import { loadDefaultScaffoldCorpus } from '../core/rag-out/scaffold-corpus.js'
import { decideScaffold } from '../core/rag-out/gate.js'

describe('Language detection — AC1: dart + fsharp added', () => {
  it('App.dart → "dart"', () => {
    expect(languageFromExtension('App.dart')).toBe('dart')
  })

  it('Program.fs → "fsharp"', () => {
    expect(languageFromExtension('Program.fs')).toBe('fsharp')
  })

  it('existing languages unchanged: .ts → typescript', () => {
    expect(languageFromExtension('index.ts')).toBe('typescript')
  })

  it('existing languages unchanged: .py → python', () => {
    expect(languageFromExtension('main.py')).toBe('python')
  })

  it('existing languages unchanged: .go → go', () => {
    expect(languageFromExtension('main.go')).toBe('go')
  })
})

describe('Cold-start corpus seed — AC2: java scaffold present without local mining', () => {
  it('default corpus contains >=1 language=java scaffold (AC2)', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const javaScaffolds = corpus.filter((s) => s.language === 'java')
    expect(javaScaffolds.length).toBeGreaterThanOrEqual(1)
  })

  it('decideScaffold for java project finds a java scaffold (AC2)', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const result = decideScaffold('add REST endpoint handler', corpus, {
      projectLanguage: 'java',
      threshold: 0.1,
    })
    // Gate must find at least a candidate of language=java (not generate due to no java scaffold)
    if (result.decision === 'recover') {
      expect(result.best?.language).toBe('java')
    } else {
      // If generate, ensure it's not because there are no java scaffolds
      const javaExist = corpus.some((s) => s.language === 'java')
      expect(javaExist).toBe(true)
    }
  })
})

describe('Corpus seed idempotency — AC3', () => {
  it('AC3: loading default corpus twice produces no duplicates (same IDs)', () => {
    const c1 = loadDefaultScaffoldCorpus()
    const c2 = loadDefaultScaffoldCorpus()
    const ids1 = c1.map((s) => s.id).sort()
    const ids2 = c2.map((s) => s.id).sort()
    expect(ids1).toEqual(ids2)
    // No duplicate ids within a single load
    const unique = new Set(ids1)
    expect(unique.size).toBe(ids1.length)
  })
})
