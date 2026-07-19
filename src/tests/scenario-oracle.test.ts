/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/scenario-oracle.ts — evaluateScenario + buildScenarioEvents.
 */

import { describe, it, expect } from 'vitest'
import { evaluateScenario, buildScenarioEvents } from '../plugins/browser/scenario-oracle.js'

describe('evaluateScenario', () => {
  it('todos os passos ok + passo terminal com pixel → passed', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_click', ok: true, concludes: true, evidence: 'shot.png' },
    ])
    expect(v.verdict).toBe('passed')
    expect(v.passedSteps).toBe(2)
    expect(v.firstFailure).toBeUndefined()
  })

  it('um passo falha → failed + firstFailure', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_click', ok: false },
      { tool: 'browser_type', ok: true },
    ])
    expect(v.verdict).toBe('failed')
    expect(v.passedSteps).toBe(2)
    expect(v.firstFailure).toBe(1)
  })

  it('cenário vazio → inconclusive (nada confirmado — não é falha, é ausência de prova)', () => {
    expect(evaluateScenario([]).verdict).toBe('inconclusive')
  })

  // ─── L1 (node_f432c8ce59e0): pixel obrigatório no passo-conclusão ───────────
  it('AC1: todos ok + passo-conclusão (concludes) COM evidence → passed', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_click', ok: true, concludes: true, evidence: 'shot.png' },
    ])
    expect(v.verdict).toBe('passed')
  })

  it('AC2: todos ok mas passo-conclusão SEM evidence → inconclusive (nunca passed)', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_click', ok: true, concludes: true },
    ])
    expect(v.verdict).toBe('inconclusive')
    expect(v.firstFailure).toBeUndefined()
  })

  it('passo-conclusão sem evidence mas com um passo falho antes → failed (falha vence inconclusive)', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: false },
      { tool: 'browser_click', ok: true, concludes: true },
    ])
    expect(v.verdict).toBe('failed')
    expect(v.firstFailure).toBe(0)
  })

  // ─── L3 (node_0db7e12b3937): passo terminal obrigatório — validar ≠ efetivar ─
  it('AC2: todos ok mas NENHUM passo concludes (parou no preview) → inconclusive', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_click', ok: true, evidence: 'preview.png' },
    ])
    expect(v.verdict).toBe('inconclusive')
  })

  it('AC3: o passo concludes falhou (ok=false), anteriores ok → failed + firstFailure no terminal', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_insert', ok: false, concludes: true },
    ])
    expect(v.verdict).toBe('failed')
    expect(v.firstFailure).toBe(1)
  })

  it('AC4: 2+ passos concludes → o ÚLTIMO é o terminal (o último sem pixel → inconclusive)', () => {
    const v = evaluateScenario([
      { tool: 'browser_click', ok: true, concludes: true, evidence: 'shot1.png' },
      { tool: 'browser_insert', ok: true, concludes: true },
    ])
    expect(v.verdict).toBe('inconclusive')
  })

  it('AC4: 2+ concludes, o ÚLTIMO com pixel → passed (mesmo se um concludes anterior não tinha)', () => {
    const v = evaluateScenario([
      { tool: 'browser_click', ok: true, concludes: true },
      { tool: 'browser_insert', ok: true, concludes: true, evidence: 'shot2.png' },
    ])
    expect(v.verdict).toBe('passed')
  })

  // ─── L2 (node_c1bc533a67ac): identidade-da-fonte asserida ANTES do valor ─────
  it('AC1: terminal com identidade batendo (/import/confirm) + pixel → passed', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      {
        tool: 'browser_insert',
        ok: true,
        concludes: true,
        evidence: 'shot.png',
        expectedIdentity: '/import/confirm',
        observedIdentity: '/import/confirm',
      },
    ])
    expect(v.verdict).toBe('passed')
  })

  it('AC2: terminal chegou na página ERRADA (esperado /import/confirm, observado /login) → inconclusive, mesmo com ok+pixel', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      {
        tool: 'browser_insert',
        ok: true,
        concludes: true,
        evidence: 'shot.png',
        expectedIdentity: '/import/confirm',
        observedIdentity: '/login',
      },
    ])
    expect(v.verdict).toBe('inconclusive')
  })

  it('AC3: terminal sem expectedIdentity nem observedIdentity → veredito de hoje (backward-compat opt-in)', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_insert', ok: true, concludes: true, evidence: 'shot.png' },
    ])
    expect(v.verdict).toBe('passed')
  })

  it('AC4: observedIdentity vazia ("") com expectedIdentity="/x" → inconclusive (vazio é divergência, nunca match acidental)', () => {
    const v = evaluateScenario([
      {
        tool: 'browser_insert',
        ok: true,
        concludes: true,
        evidence: 'shot.png',
        expectedIdentity: '/x',
        observedIdentity: '',
      },
    ])
    expect(v.verdict).toBe('inconclusive')
  })

  // ─── L6 (node_5db2ab4e6bbf): cross-check opt-in — rebaixa veredito sem prova de efeito ─
  const terminalOk = { tool: 'browser_insert', ok: true, concludes: true, evidence: 'shot.png' } as const

  it('AC1: expectsEffect + crossCheck com delta real (822→823) → passed', () => {
    const v = evaluateScenario([
      { ...terminalOk, expectsEffect: true, crossCheck: [{ before: 822, after: 823, source: 'db' }] },
    ])
    expect(v.verdict).toBe('passed')
  })

  it('AC2: expectsEffect mas SEM crossCheck → inconclusive (não provou o efeito)', () => {
    const v = evaluateScenario([{ ...terminalOk, expectsEffect: true }])
    expect(v.verdict).toBe('inconclusive')
  })

  it('AC3: crossCheck delta ZERO (822→822) num cenário que prometia criar → inconclusive', () => {
    const v = evaluateScenario([
      { ...terminalOk, expectsEffect: true, crossCheck: [{ before: 822, after: 822, source: 'db' }] },
    ])
    expect(v.verdict).toBe('inconclusive')
  })

  it('AC4: crossCheck malformado (after ausente/NaN) → tratado como sem prova → inconclusive', () => {
    const v = evaluateScenario([
      { ...terminalOk, expectsEffect: true, crossCheck: [{ before: 822, after: Number.NaN, source: 'db' }] },
    ])
    expect(v.verdict).toBe('inconclusive')
  })

  it('backward-compat: SEM expectsEffect (read-only) → cross-check não dispara, passed como antes', () => {
    const v = evaluateScenario([{ ...terminalOk }])
    expect(v.verdict).toBe('passed')
  })
})

describe('buildScenarioEvents', () => {
  it('AC1: started → step(+evidence) → passed/failed, ordenado', () => {
    const ev = buildScenarioEvents('sc1', [
      { tool: 'browser_navigate', ok: true, evidence: 'shot1.png' },
      { tool: 'browser_click', ok: true, concludes: true, evidence: 'shot2.png' },
    ])
    expect(ev[0].kind).toBe('started')
    expect(ev[ev.length - 1].kind).toBe('passed')
    expect(ev.map((e) => e.kind)).toEqual(['started', 'step', 'evidence', 'step', 'evidence', 'passed'])
    expect(ev.every((e) => e.scenarioId === 'sc1')).toBe(true)
  })

  it('cenário com falha termina em failed', () => {
    const ev = buildScenarioEvents('sc2', [{ tool: 'browser_click', ok: false }])
    expect(ev[ev.length - 1].kind).toBe('failed')
  })
})
