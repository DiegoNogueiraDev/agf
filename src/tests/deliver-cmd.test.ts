import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations, configureDb } from '../core/store/migrations.js'
import { summarizeScaffoldRecovery } from '../core/economy/economy-lever-ledger.js'
import { buildPrdPrompt, generatePrd } from '../core/prd/generate-prd.js'
import { deliverCommand, decidePrdScaffold, recordScaffoldRecoveryLever } from '../cli/commands/deliver-cmd.js'

describe('deliverCommand', () => {
  it('returns a Command instance', () => {
    const cmd = deliverCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = deliverCommand()
    expect(cmd.name()).toBe('deliver')
  })

  it('has a non-empty description', () => {
    const cmd = deliverCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

describe('decidePrdScaffold — wiring RAG-OUT into deliver (node_ed0861c85aa6)', () => {
  it('objetivo com score abaixo do noveltyFloor do prd-software → undefined (sem 3º argumento)', () => {
    const result = decidePrdScaffold('zxqvw blorptastic nonsense goal that matches nothing')
    expect(result).toBeUndefined()
  })

  it('objetivo casando com o scaffold prd-software → slots corretos', () => {
    const result = decidePrdScaffold('PRD de produto de software com fases e métricas para um kanban de tarefas')
    expect(result).toEqual({ slots: ['nome', 'problema', 'fases[]', 'metricas[]', 'riscos[]'] })
  })
})

describe('recordScaffoldRecoveryLever — grava o lever scaffold_recovery (node_c9a4960a2fff)', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
  })

  afterAll(() => {
    db.close()
  })

  it('decision recover → economy_lever_ledger ganha linha scaffold_recovery com saved > 0', () => {
    recordScaffoldRecoveryLever(
      db,
      'PRD de produto de software com fases e métricas para um kanban de tarefas',
      'test-session',
    )
    const summary = summarizeScaffoldRecovery(db)
    expect(summary.recovered).toBeGreaterThan(0)
    expect(summary.tokensSaved).toBeGreaterThan(0)
  })

  it('decision generate → linha passthrough (saved=0, não conta como recovered)', () => {
    const before = summarizeScaffoldRecovery(db)
    recordScaffoldRecoveryLever(db, 'zxqvw blorptastic nonsense goal that matches nothing', 'test-session')
    const after = summarizeScaffoldRecovery(db)
    // Espelha recordEconomy (montar-output-cmd.ts): sempre grava, best-effort;
    // accepted=false no caso generate, então não conta como economia real.
    expect(after.recovered).toBe(before.recovered)
    expect(after.tokensSaved).toBe(before.tokensSaved)
    expect(after.generated).toBe(before.generated + 1)
  })
})

describe('T5 — regressão: comportamento sem match é byte-idêntico ponta a ponta (node_d3e9d55f3c99)', () => {
  it('objetivo sem sobreposição lexical → decidePrdScaffold(undefined) → generatePrd cai no buildPrdPrompt de sempre', async () => {
    const goal = 'zxqvw blorptastic nonsense goal that matches nothing in any known corpus'
    const scaffold = decidePrdScaffold(goal)
    expect(scaffold).toBeUndefined()

    let seenPrompt = ''
    await generatePrd(
      goal,
      {
        generate: async (prompt) => {
          seenPrompt = prompt
          return '# PRD'
        },
      },
      scaffold,
    )
    expect(seenPrompt).toBe(buildPrdPrompt(goal))
  })

  it('objetivo quase-match mas abaixo do noveltyFloor (recover falso-positivo evitado) → prompt completo, com ## Riscos (mitigação node_7eb68f1b471d)', async () => {
    // "fases e métricas" sozinho bate pouco fitTags do prd-software sem o
    // restante do vocabulário do scaffold — fica abaixo do noveltyFloor 0.62.
    const goal = 'fases e métricas de um projeto qualquer sem relação com PRD'
    const scaffold = decidePrdScaffold(goal)
    expect(scaffold).toBeUndefined()

    let seenPrompt = ''
    await generatePrd(
      goal,
      {
        generate: async (prompt) => {
          seenPrompt = prompt
          return '# PRD'
        },
      },
      scaffold,
    )
    expect(seenPrompt).toContain('## Riscos')
  })
})
