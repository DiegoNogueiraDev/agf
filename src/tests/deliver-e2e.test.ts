/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Teste de NÍVEL PRODUTO (determinístico, 0 token) — a complexidade que esperamos
 * em produção: pedido → normalizar (0 token) → PRD → grafo → autopilot (TDD/DoD/
 * WIP=1) — encadeado, sem IA real (LLM fake injetado). Prova que o fluxo `deliver`
 * roda CORRETAMENTE com as práticas de grafo e termina limpo, gastando 0 token.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { normalizeInput } from '../core/intake/normalize-input.js'
import { generatePrd } from '../core/prd/generate-prd.js'
import { extractEntities } from '../core/parser/extract.js'
import { convertToGraph } from '../core/importer/prd-to-graph.js'
import { runBuildOrchestration } from '../cli/shared/run-build.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import { persistLedger } from '../core/observability/llm-call-ledger.js'
import { seedGreenfieldCorpus, githubCorpusSignals } from '../core/scaffolder/github-corpus.js'
import { FailoverModelAdapter } from '../core/model-hub/failover-model-adapter.js'
import {
  TieredModelClient,
  type ModelAdapter,
  type ModelRequest,
  type ModelResponse,
} from '../core/model-hub/model-client.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('e2e')
  return store
}

const SAMPLE_PRD = readFileSync(join(process.cwd(), 'docs/examples/sample-prd.md'), 'utf8')

describe('deliver e2e — chain determinístico (0 token)', () => {
  it('pedido → normalizar → PRD(fake) → grafo → autopilot(simulate): roda e termina limpo', async () => {
    const store = freshStore()
    const ledger = new TokenLedger()
    let llmCalls = 0
    try {
      // 1) intake determinístico (0 token)
      const norm = await normalizeInput({ kind: 'text', value: 'crie uma CLI de tarefas (todo)' })
      expect(norm.source).toBe('text')

      // 2) PRD via LLM FAKE (conta chamadas; retorna um PRD bem-formado conhecido)
      const md = await generatePrd(norm.text, {
        generate: async () => {
          llmCalls++
          return SAMPLE_PRD
        },
      })
      expect(md.length).toBeGreaterThan(100)

      // 3) grafo
      const graph = convertToGraph(extractEntities(md), 'PRD.md')
      store.bulkInsert(graph.nodes, graph.edges)
      expect(graph.nodes.length).toBeGreaterThan(0)

      // 4) build orquestrado em SIMULATE (sem modelo → 0 token)
      const wipSamples: number[] = []
      const report = await runBuildOrchestration(store, {
        dir: process.cwd(),
        maxSteps: 40,
        live: false,
        testCmd: 'echo ok',
        ledger,
        onLog: () => {
          // amostra o WIP a cada passo (Little's Law: WIP <= 1)
          wipSamples.push(store.getNodesByStatus('in_progress').length)
        },
      })

      // Entrega COMPLETA: a máquina de estados chega a 'done' (sem runaway/budget).
      expect(report.stopped).toBe('done')
      expect(report.steps).toBeLessThan(40) // não queimou o budget
      expect(report.actions.every((a) => a === 'implement' || a === 'decompose' || a === 'import_prd')).toBe(true)
      // Progresso real: tasks acionáveis chegaram a 'done'.
      expect(store.getNodesByStatus('done').length).toBeGreaterThan(0)
      // WIP=1 invariante (Little's Law): nunca houve mais de 1 task in_progress.
      expect(Math.max(0, ...wipSamples)).toBeLessThanOrEqual(1)
      // 0 token: PRD veio do fake; autopilot simulate não chama modelo.
      expect(llmCalls).toBe(1)
      expect(ledger.totals().total).toBe(0)
    } finally {
      store.close()
    }
  })

  it('intake comprime entrada verbosa antes da IA (tokensSaved > 0)', async () => {
    const verbose = Array.from(
      { length: 300 },
      (_, i) => `linha ${i}: contexto verboso e repetitivo que infla tokens.`,
    ).join('\n')
    const norm = await normalizeInput({ kind: 'text', value: verbose }, undefined, { budgetTokens: 150 })
    expect(norm.tokensSaved).toBeGreaterThan(0)
    expect(norm.tokensAfter).toBeLessThan(norm.tokensBefore)
  })

  it('imagem sem OCR e sem visão → erro acionável (não gasta token às cegas)', async () => {
    await expect(normalizeInput({ kind: 'image', path: '/tmp/x.png' }, { ocr: async () => null })).rejects.toThrow(
      /OCR|vis[aã]o/i,
    )
  })

  it('capstone: greenfield seed(fake) + PRD via failover(fake) → grafo → autopilot, 0 token/0 rede', async () => {
    const store = freshStore()
    const ledger = new TokenLedger()
    try {
      // intake determinístico
      const norm = await normalizeInput({
        kind: 'text',
        value: 'crie um kanban com colunas a fazer, fazendo e feito; mover cards entre colunas',
      })

      // semente greenfield via fetch FAKE (0 rede) — "pássaros trazem sementes"
      const fakeFetch = async (): Promise<unknown> => ({
        items: [
          {
            full_name: 'x/kanban',
            html_url: 'h',
            stargazers_count: 10,
            description: 'kanban board state machine',
            topics: ['kanban'],
          },
        ],
      })
      const { seeded } = await seedGreenfieldCorpus(store, 'kanban board', { fetchJson: fakeFetch })
      expect(seeded).toBe(1)
      expect(Object.keys(githubCorpusSignals(store)).length).toBeGreaterThan(0)

      // PRD gerado por um TieredModelClient sobre FAILOVER: o primário falha → cai
      // para o fallback. Adapters fakes = 0 token. Prova resiliência no caminho real.
      const failing: ModelAdapter = {
        generate: async (): Promise<ModelResponse> => {
          throw new Error('primary down')
        },
      }
      let fallbackCalls = 0
      const working: ModelAdapter = {
        generate: async (r: ModelRequest): Promise<ModelResponse> => {
          fallbackCalls++
          return { text: SAMPLE_PRD, model: r.model, tokensIn: 0, tokensOut: 0 }
        },
      }
      const failover = new FailoverModelAdapter([
        { providerId: 'primary', adapter: failing },
        { providerId: 'fallback', adapter: working },
      ])
      const client = new TieredModelClient(failover, { mode: 'auto' })
      const md = await generatePrd(norm.text, { generate: async (p) => (await client.run('plan', p)).text })
      expect(fallbackCalls).toBe(1)
      expect(failover.failoverStatus().fallbackCount).toBe(1)

      // grafo + build simulate → chega a 'done', 0 token
      const graph = convertToGraph(extractEntities(md), 'PRD.md')
      store.bulkInsert(graph.nodes, graph.edges)
      const report = await runBuildOrchestration(store, {
        dir: process.cwd(),
        maxSteps: 40,
        live: false,
        testCmd: 'echo ok',
        ledger,
        onLog: () => {},
      })
      expect(report.stopped).toBe('done')
      expect(store.getNodesByStatus('done').length).toBeGreaterThan(0)
      expect(ledger.totals().total).toBe(0)
    } finally {
      store.close()
    }
  })

  it('llm_call_ledger preenchido com usage real após deliver (não estimado)', async () => {
    const store = freshStore()
    const ledger = new TokenLedger()
    try {
      const md = await generatePrd('crie um logger', { generate: async () => SAMPLE_PRD })
      const graph = convertToGraph(extractEntities(md), 'PRD.md')
      store.bulkInsert(graph.nodes, graph.edges)

      const report = await runBuildOrchestration(store, {
        dir: process.cwd(),
        maxSteps: 40,
        live: false,
        testCmd: 'echo ok',
        ledger,
        onLog: () => {},
      })

      expect(report.stopped).toBe('done')

      // Simula persistência como faria um provider real: grava ledged no SQLite
      ledger.recordCall('task-1', {
        model: 'deepseek/deepseek-chat',
        prompt: 'implemente a funcao',
        response: 'function foo() { return 1 }',
        reportedIn: 100,
        reportedOut: 25,
      })
      const persistedRows = persistLedger(store.getDb(), ledger, {
        sessionId: 'e2e-deliver',
        provider: 'fake-provider',
      })
      expect(persistedRows).toBeGreaterThan(0)

      // llm_call_ledger tem usage real
      const row = store
        .getDb()
        .prepare(
          'SELECT COUNT(*) AS cnt, SUM(input_tokens) AS tin, SUM(output_tokens) AS tout FROM llm_call_ledger WHERE session_id = ?',
        )
        .get('e2e-deliver') as { cnt: number; tin: number; tout: number }
      expect(row.cnt).toBeGreaterThan(0)
      expect(row.tin).toBe(100)
      expect(row.tout).toBe(25)
    } finally {
      store.close()
    }
  })
})
