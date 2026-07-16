/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Orquestração de build compartilhada (extraída de `build-cmd`) — PRD.md→grafo→
 * decompõe→autopilot via a máquina de estados determinística (`runDelivery` +
 * `deriveDeliveryState`). Reusada por `build` (a partir de PRD.md) e por `deliver`
 * (que já populou o grafo antes; o passo de import vira no-op pela máquina de estados).
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { runDelivery, type DeliveryHandlers, type DeliveryReport } from '../../core/orchestrator/run-delivery.js'
import { deriveDeliveryState } from '../../core/orchestrator/delivery-state.js'
import { extractEntities } from '../../core/parser/extract.js'
import { convertToGraph } from '../../core/importer/prd-to-graph.js'
import { autoDecomposeLarge } from '../../core/planner/auto-decompose.js'
import { runAutopilot, escalationReason } from '../../core/autonomy/autopilot-loop.js'
import { resolveHarvestHook } from './build-harvest-hook.js'
import { makeStorePort } from './store-port.js'
import { buildLiveImplement } from './live-implement.js'
import type { TokenLedger } from '../../core/autonomy/token-ledger.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { McpGraphError } from '../../core/utils/errors.js'

/** Options for `runBuildOrchestration` — wires PRD path, step limits, live mode, and logging. */
export interface RunBuildOptions {
  dir: string
  /** Caminho do PRD a importar quando a máquina de estados pedir (default PRD.md). */
  prd?: string
  /** Teto de passos do orquestrador (cost-runaway). */
  maxSteps: number
  /** Implementa com o modelo real (autopilot --live). */
  live: boolean
  /** Comando de teste no --live. */
  testCmd: string
  /** Ledger acumulador (medição). */
  ledger: TokenLedger
  /** Sink de log (CLI imprime; TUI anexa). */
  onLog: (msg: string) => void
  /** Opt-out da colheita automática no NO_TASKS (default: colhe e re-alimenta). */
  noHarvest?: boolean
}

/** Importa o PRD (opts.prd ou PRD.md no dir) para o grafo, se ainda não importado. */
function importPrdFile(store: SqliteStore, dir: string, onLog: (m: string) => void, prdPath?: string): void {
  const path = prdPath ?? join(dir, 'PRD.md')
  if (!existsSync(path)) {
    throw new McpGraphError(
      `PRD não encontrado em ${path}. Rode 'generate-prd "<descrição>"' ou passe --prd <arquivo>.`,
    )
  }
  if (!store.getProject()) store.initProject(basename(dir))
  const entities = extractEntities(readFileSync(path, 'utf8'))
  const graph = convertToGraph(entities, path)
  store.bulkInsert(graph.nodes, graph.edges)
  onLog(`  ✓ importado: ${graph.nodes.length} nós, ${graph.edges.length} arestas`)
}

/**
 * Roda a orquestração de entrega (import→decompõe→autopilot) sobre o grafo do
 * projeto. Retorna o relatório da máquina de estados. Lança em escalação.
 */
export async function runBuildOrchestration(store: SqliteStore, opts: RunBuildOptions): Promise<DeliveryReport> {
  const live = opts.live
    ? buildLiveImplement({
        store,
        dir: opts.dir,
        testCmd: opts.testCmd,
        retries: 3,
        ledger: opts.ledger,
        onLog: opts.onLog,
      })
    : null

  const handlers: DeliveryHandlers = {
    importPrd: async () => importPrdFile(store, opts.dir, opts.onLog, opts.prd),
    decompose: async () => {
      const report = autoDecomposeLarge(store)
      opts.onLog(`  ✓ decompostas ${report.decomposed.length} epic(s) em subtasks`)
    },
    implement: async () => {
      const port = makeStorePort(store)
      const implement = live ? live.implement : undefined
      const result = await runAutopilot(port, {
        maxIterations: 1,
        implement,
        onHarvest: resolveHarvestHook(store, opts.dir, { noHarvest: opts.noHarvest }),
        onStep: (s) =>
          opts.onLog(
            `  ${s.action === 'done' ? '✓' : s.action === 'escalated' ? '⚠' : '→'} ${s.title} [${s.action}] ${s.detail}`,
          ),
      })
      if (result.stopped === 'escalation') {
        // node_a540ef426973 — carrega o motivo REAL (ex.: 401 do provider) para a
        // superfície classificar (auth/rate_limit/…), não mascarar com genérico.
        const reason = escalationReason(result)
        throw new McpGraphError(
          reason
            ? `autopilot escalou — intervenção necessária: ${reason}`
            : 'autopilot escalou — intervenção necessária',
        )
      }
    },
  }

  return runDelivery(() => deriveDeliveryState(store), handlers, {
    maxSteps: opts.maxSteps,
    onStep: (s) => opts.onLog(`» ${s.action}: ${s.reason}`),
  })
}
