/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { writeMemory, readAllMemories } from '../core/memory/memory-reader.js'
import { buildMemoryPack, memoryPackFromLevers } from '../core/memory/memory-pack.js'
import { estimateTokens } from '../core/context/token-estimator.js'

// node_2a8c83993c72 — pack de memória com teto de tokens (mem0: 594→166 no
// mesmo query): top-N por salience (frontmatter `salience` do amortize-on-write
// + decay de retention.ts) sob budget default 200; economia real no
// economy_lever_ledger; lever memory_salience OFF ⇒ leitura atual intocada.

const PHRASE = 'lição durável do ciclo sobre gates, leases e worktrees da colônia. '

function makeLedgerDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE economy_lever_ledger (
    id TEXT PRIMARY KEY, ts INTEGER, session_id TEXT, node_id TEXT, lever TEXT,
    tokens_before INTEGER, tokens_after INTEGER, saved INTEGER, accepted INTEGER,
    gate_outcome TEXT, score REAL, baseline_method TEXT, surface TEXT
  )`)
  return db
}

describe('buildMemoryPack — teto de tokens + top-N por salience', () => {
  let base: string

  beforeEach(async () => {
    base = mkdtempSync(join(tmpdir(), 'agf-mem-pack-'))
    // 24 entradas: salience decrescente 0.99, 0.95, … (frontmatter do amortize);
    // ~30 tokens cada ⇒ total ~720 >= 500.
    for (let i = 0; i < 24; i += 1) {
      const salience = (99 - i * 4) / 100
      await writeMemory(base, `mem-${String(i).padStart(2, '0')}`, `entrada ${i}: ${PHRASE.repeat(2)}`)
      // grava a salience via frontmatter manual (o amortize faz isso no write real)
      const { writeFileSync, readFileSync } = await import('node:fs')
      const p = join(base, 'workflow-graph', 'memories', `mem-${String(i).padStart(2, '0')}.md`)
      writeFileSync(p, `---\nsalience: ${salience}\n---\n${readFileSync(p, 'utf-8')}`)
    }
  })

  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('AC1: 24 entradas (≥500 tokens) + budget 200 ⇒ pack ≤200 tokens com as top-N por salience', async () => {
    const all = await readAllMemories(base)
    const totalTokens = all.reduce((s, m) => s + estimateTokens(m.content), 0)
    expect(totalTokens).toBeGreaterThanOrEqual(500) // fixture realmente estoura

    const pack = await buildMemoryPack(base, { budgetTokens: 200 })

    expect(pack).not.toBeNull()
    expect(pack!.tokens).toBeLessThanOrEqual(200)
    expect(pack!.entries.length).toBeGreaterThan(0)
    expect(pack!.entries.length).toBeLessThan(24)
    // top-N: as selecionadas são exatamente as de MAIOR salience (prefixo da ordem)
    const names = pack!.entries.map((e) => e.name)
    const sortedBySalience = [...names].sort()
    expect(names).toEqual(sortedBySalience) // mem-00, mem-01, … (salience decresce com o índice)
    expect(names[0]).toBe('mem-00')
  })

  it('AC3: pack com ledger ⇒ linha saved>0 atribuída à lever memory_salience', async () => {
    const db = makeLedgerDb()

    await buildMemoryPack(base, { budgetTokens: 200, ledger: { db, sessionId: 'pack-test', nodeId: 'n1' } })

    const row = db.prepare("SELECT saved, surface FROM economy_lever_ledger WHERE lever = 'memory_salience'").get() as
      { saved: number; surface: string } | undefined
    expect(row).toBeDefined()
    expect(row!.saved).toBeGreaterThan(0)
    db.close()
  })

  it('AC2: lever OFF ⇒ memoryPackFromLevers devolve null e a leitura atual segue intocada', async () => {
    expect(memoryPackFromLevers({})).toBeNull() // gate: sem lever, sem pack

    const before = await readAllMemories(base)
    await buildMemoryPack(base, { budgetTokens: 200 }) // montar pack não muta nada
    const after = await readAllMemories(base)
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
  })

  it('lever ON no config ⇒ memoryPackFromLevers devolve as opções com budget do param', () => {
    expect(memoryPackFromLevers({ memory_salience: { enabled: true } })).toEqual({ budgetTokens: 200 })
    expect(memoryPackFromLevers({ memory_salience: { enabled: true, params: { packBudgetTokens: 350 } } })).toEqual({
      budgetTokens: 350,
    })
  })

  it('determinismo: dois packs do mesmo estado + mesmo relógio são idênticos', async () => {
    const nowMs = 1_800_000_000_000 // relógio injetável — mesmo contrato do runGenesis
    const a = await buildMemoryPack(base, { budgetTokens: 200, nowMs })
    const b = await buildMemoryPack(base, { budgetTokens: 200, nowMs })
    expect(JSON.stringify(a?.entries)).toBe(JSON.stringify(b?.entries))
  })
})
