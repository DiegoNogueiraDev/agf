/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { isAmbiguous, decisionGate, decideBest } from '../../core/scaffolder/decide.js'
import { getScaffold, type ScaffoldKind } from '../../core/scaffolder/registry.js'
import type { RankedScaffold } from '../../core/scaffolder/retrieve-rank.js'

function r(kind: ScaffoldKind, score: number): RankedScaffold {
  return { kind, score, entry: getScaffold(kind)! }
}

describe('decide — decisão-LLM mínima (decision-only)', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('p')
    delete process.env.AGF_DECIDE
  })
  afterEach(() => {
    store.close()
    delete process.env.AGF_DECIDE
  })

  it('isAmbiguous: empate técnico no topo', () => {
    expect(isAmbiguous([r('contract', 3), r('interface', 3)])).toBe(true)
    expect(isAmbiguous([r('contract', 5), r('interface', 1)])).toBe(false)
    expect(isAmbiguous([r('contract', 3)])).toBe(false)
  })

  it('gate: default permite; AGF_DECIDE=0 e λ saturado negam', () => {
    expect(decisionGate(store).allowed).toBe(true)
    process.env.AGF_DECIDE = '0'
    expect(decisionGate(store).allowed).toBe(false)
    delete process.env.AGF_DECIDE
    store.setProjectSetting('flow_phi', '1') // λ=1.65 ≥ 1.0
    expect(decisionGate(store).allowed).toBe(false)
  })

  it('decideBest: ambíguo + decisor → reordena a escolha p/ frente', async () => {
    const ranked = [r('contract', 3), r('interface', 3), r('formula', 1)]
    const out = await decideBest(store, { title: 'x' }, ranked, { decide: async () => 'use interface' })
    expect(out[0].kind).toBe('interface')
  })

  it('sem decisor OU não-ambíguo → argmax determinístico inalterado', async () => {
    const ranked = [r('contract', 5), r('interface', 1)]
    expect((await decideBest(store, { title: 'x' }, ranked, {}))[0].kind).toBe('contract')
    const amb = [r('contract', 3), r('interface', 3)]
    expect((await decideBest(store, { title: 'x' }, amb, {}))[0].kind).toBe('contract') // sem decisor
  })
})
