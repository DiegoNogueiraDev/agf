/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectProjectMode,
  scanProjectCorpus,
  resolveCorpusRoots,
  addCorpusRoot,
  scanMultiCorpus,
} from '../../core/scaffolder/corpus.js'
import { SqliteStore } from '../../core/store/sqlite-store.js'

describe('corpus — brownfield usa o próprio projeto (scan determinístico)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-corpus-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('dir vazio → greenfield', () => {
    expect(detectProjectMode(dir)).toBe('greenfield')
    expect(scanProjectCorpus(dir).fileCount).toBe(0)
  })

  it('projeto com src/ → brownfield e detecta sinais de capacidade', () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(
      join(dir, 'src', 'order-reducer.ts'),
      'export function reduce(state, event) { /* state machine transition */ }',
      'utf8',
    )
    writeFileSync(join(dir, 'src', 'api.ts'), 'export function handler(req, res) { /* rest endpoint */ }', 'utf8')
    expect(detectProjectMode(dir)).toBe('brownfield')
    const corpus = scanProjectCorpus(dir)
    expect(corpus.mode).toBe('brownfield')
    expect(corpus.fileCount).toBe(2)
    // 'state'/'reducer'/'transition' e 'handler'/'rest'/'endpoint' são keywords
    expect(corpus.capabilitySignals['state-machine']).toBeGreaterThan(0)
    expect(corpus.capabilitySignals['contract']).toBeGreaterThan(0)
  })
})

describe('corpus multi-projeto — dogfooding determinístico', () => {
  it('resolveCorpusRoots inclui o próprio dir + roots registrados (sem hardcode)', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('p')
    try {
      const a = mkdtempSync(join(tmpdir(), 'agf-rootA-'))
      const b = mkdtempSync(join(tmpdir(), 'agf-rootB-'))
      mkdirSync(join(b, 'src'), { recursive: true })
      writeFileSync(join(b, 'src', 'svc.ts'), 'export interface Service { run(): void } // methods', 'utf8')
      addCorpusRoot(store, b)
      const roots = resolveCorpusRoots(store, a)
      expect(roots[0]).toContain('agf-rootA-') // próprio dir primeiro
      expect(roots.some((r) => r.includes('agf-rootB-'))).toBe(true)
      // agrega sinais entre raízes
      const corpus = scanMultiCorpus(roots)
      expect(corpus.capabilitySignals['interface']).toBeGreaterThan(0)
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    } finally {
      store.close()
    }
  })
})
