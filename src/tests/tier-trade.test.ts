/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * A/B cascade ON vs OFF — prova, com custo REAL, a troca economia↔assertividade
 * do roteamento em cascade (epic node_66df2059d21e; task node_feb062f1496a).
 *
 * Zero mock: a fonte é um SQLite REAL (`:memory:`) com os seams reais de gravação
 * (`recordModelCall` → llm_call_ledger, `recordLeverEvent` → economy_lever_ledger).
 * O executor é o stub-com-contador SANCIONADO pelo brief do projeto ("stub da
 * chamada LLM com contador") — devolve números REAIS conhecidos por braço, nunca
 * intercepta um seam. A prova-chave (AC3/AC5-irmã): custo CONHECIDO injetado ⇒
 * incremento EXATO no ledger — cost!=0 não basta, 0 também significa contador off.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  runCascadeAb,
  type CascadeArm,
  type CascadeArmExecutor,
  type CascadeArmUsage,
} from '../core/evals/tier-trade.js'
import { summarizeLedgerByTier } from '../core/observability/llm-call-ledger.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'

const LLM_LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS llm_call_ledger (
    id TEXT PRIMARY KEY, ts INTEGER NOT NULL, project_id TEXT, run_id TEXT, node_id TEXT,
    caller TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER, reasoning_tokens INTEGER, cost_usd REAL, status TEXT,
    session_id TEXT, model_tier TEXT, escalated INTEGER DEFAULT 0, escalation_reason TEXT, agent_id TEXT
  )`

const LEVER_LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS economy_lever_ledger (
    id TEXT PRIMARY KEY, ts INTEGER NOT NULL, session_id TEXT NOT NULL, node_id TEXT,
    lever TEXT NOT NULL, tokens_before INTEGER NOT NULL, tokens_after INTEGER NOT NULL,
    saved INTEGER NOT NULL, accepted INTEGER NOT NULL DEFAULT 0,
    gate_outcome TEXT NOT NULL DEFAULT 'passthrough', score REAL, baseline_method TEXT, surface TEXT
  )`

/**
 * Stub-com-contador sancionado: números REAIS conhecidos por braço. `on` (cascade)
 * roda cheap+barato; `off` (baseline) roda frontier+caro — o delta é a economia.
 * `calls` é o contador que prova que cada braço foi realmente exercitado.
 */
function knownCostExecutor(available: boolean): CascadeArmExecutor & { calls: number } {
  const usageByArm: Record<CascadeArm, CascadeArmUsage> = {
    on: {
      provider: 'openrouter',
      model: 'deepseek-v4-flash',
      modelTier: 'cheap',
      inputTokens: 100,
      outputTokens: 40,
      costUsd: 0.002,
    },
    off: {
      provider: 'openrouter',
      model: 'qwen3.6-plus',
      modelTier: 'frontier',
      inputTokens: 100,
      outputTokens: 40,
      costUsd: 0.05,
    },
  }
  return {
    calls: 0,
    available: () => available,
    async runArm(arm: CascadeArm): Promise<CascadeArmUsage> {
      this.calls++
      return usageByArm[arm]
    },
  }
}

describe('A/B cascade ON vs OFF — custo real no ledger (node_feb062f1496a)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(LLM_LEDGER_DDL)
    db.exec(LEVER_LEDGER_DDL)
  })

  afterEach(() => db.close())

  // ─── AC1: braços live gravam custo real (!=0) por braço; tokens no lever ─────
  it('AC1: roda ambos os braços live e grava ≥1 linha por braço com cost_usd real (!=0)', async () => {
    const exec = knownCostExecutor(true)

    const outcome = await runCascadeAb(db, exec, ['task-alpha', 'task-beta'], { sessionId: 's1' })

    expect(outcome.mode).toBe('live')
    if (outcome.mode !== 'live') return

    // Contador real: 2 tasks × 2 braços = 4 chamadas exercitadas de fato.
    expect(exec.calls).toBe(4)

    // llm_call_ledger: ≥1 linha por braço (cheap=on, frontier=off), custo real != 0.
    const byTier = new Map(summarizeLedgerByTier(db).map((t) => [t.tier, t]))
    expect(byTier.get('cheap')?.calls).toBe(2)
    expect(byTier.get('frontier')?.calls).toBe(2)
    expect(byTier.get('cheap')?.totalCostUsd).toBeGreaterThan(0)
    expect(byTier.get('frontier')?.totalCostUsd).toBeGreaterThan(0)

    // economy_lever_ledger: o cascade registrou tokens economizados (delta real).
    const cascade = summarizeByLever(db).find((l) => l.lever === 'cascade')
    expect(cascade).toBeDefined()
    expect(cascade?.count).toBe(2)

    // Deltas honestos: cascade (on) custa MENOS que baseline (off) neste fixture.
    expect(outcome.arms.on.costUsd).toBeCloseTo(0.004, 6)
    expect(outcome.arms.off.costUsd).toBeCloseTo(0.1, 6)
    expect(outcome.costDeltaUsd).toBeCloseTo(-0.096, 6) // on − off < 0 ⇒ economia
  })

  // ─── AC3/AC5-irmã: custo CONHECIDO ⇒ incremento EXATO (instrumento plugado) ──
  it('AC5: custo conhecido injetado reflete incremento EXATO no ledger — prova o instrumento plugado', async () => {
    const exec = knownCostExecutor(true)

    await runCascadeAb(db, exec, ['solo'], { sessionId: 's2' })

    // 1 task × 2 braços: exatamente 2 linhas em llm_call_ledger, soma exata dos custos.
    const total = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd),0) AS cost FROM llm_call_ledger').get() as {
      n: number
      cost: number
    }
    expect(total.n).toBe(2)
    expect(total.cost).toBeCloseTo(0.052, 6) // 0.002 (on) + 0.05 (off) — incremento exato, não estimado

    // 1 linha cascade em economy_lever_ledger com o saved exato (tokens on == off aqui ⇒ 0 saved honesto).
    const leverRow = db.prepare('SELECT COUNT(*) AS n FROM economy_lever_ledger WHERE lever = ?').get('cascade') as {
      n: number
    }
    expect(leverRow.n).toBe(1)
  })

  // ─── AC2: provider indisponível ⇒ delegated, NUNCA custo 0 silencioso ────────
  it('AC2: provider indisponível retorna mode:delegated e NÃO grava nenhuma linha (nunca 0 silencioso)', async () => {
    const exec = knownCostExecutor(false)

    const outcome = await runCascadeAb(db, exec, ['task-alpha'], { sessionId: 's3' })

    expect(outcome.mode).toBe('delegated')
    if (outcome.mode === 'delegated') expect(outcome.reason).toMatch(/provider|delegat/i)

    // Nenhum braço rodou; nenhuma linha 0 silenciosa em nenhum ledger.
    expect(exec.calls).toBe(0)
    const llm = db.prepare('SELECT COUNT(*) AS n FROM llm_call_ledger').get() as { n: number }
    const lever = db.prepare('SELECT COUNT(*) AS n FROM economy_lever_ledger').get() as { n: number }
    expect(llm.n).toBe(0)
    expect(lever.n).toBe(0)
  })

  // ─── Guardrail: task-set vazio é erro acionável, não custo 0 silencioso ──────
  it('task-set vazio lança erro acionável (nunca resolve com 0 silencioso)', async () => {
    const exec = knownCostExecutor(true)
    await expect(runCascadeAb(db, exec, [], { sessionId: 's4' })).rejects.toThrow(/task-set/i)
  })
})
