/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da orquestração genesis (node_7159c356573c) — ideia → grafo → primeiro
 * brief em 1 round-trip, com relatório honesto {name, ok, ms} por etapa.
 * Integração real em sandbox demo com PRD via fake (0 token — mesmo padrão do
 * deliver-e2e.test.ts); falha injetada por stub prova o envelope ok:false
 * nomeando a etapa (lição do bug exec chain node_e3972a535bf6).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runGenesis, GENESIS_STEP_NAMES, type GenesisHandlers } from '../core/orchestrator/genesis.js'
import { runGraphOnlySetup } from '../cli/commands/init-cmd.js'
import { createDemoSandbox } from '../core/init/demo-sandbox.js'
import { openStoreOrFail } from '../cli/open-store.js'
import { generatePrd } from '../core/prd/generate-prd.js'
import { extractEntities } from '../core/parser/extract.js'
import { convertToGraph } from '../core/importer/prd-to-graph.js'
import { detectLargeTasks } from '../core/planner/decompose.js'
import { persistDecomposition } from '../core/planner/smart-decompose.js'
import { detectAllGaps } from '../core/gaps/index.js'
import { findNextTask } from '../core/planner/next-task.js'
import { buildExecutorBrief, type ExecutorBrief } from '../core/context/executor-brief.js'
import { getNodeAcTexts } from '../core/utils/ac-helpers.js'

const SAMPLE_PRD = readFileSync(join(process.cwd(), 'docs/examples/sample-prd.md'), 'utf8')
const IDEA = 'um CLI de lista de tarefas com add, list e concluir'

/** Handlers reais (consumidor de verdade) sobre um sandbox demo; PRD via fake (0 token). */
function realHandlers(dir: string): GenesisHandlers<ExecutorBrief> {
  return {
    init: () => runGraphOnlySetup(dir),
    generatePrd: (idea) => generatePrd(idea, { generate: async () => SAMPLE_PRD }),
    importPrd: async (md) => {
      const graph = convertToGraph(extractEntities(md), 'PRD.md')
      const store = openStoreOrFail(dir)
      try {
        store.bulkInsert(graph.nodes, graph.edges)
        return { nodes: graph.nodes.length, edges: graph.edges.length }
      } finally {
        store.close()
      }
    },
    decompose: async () => {
      const store = openStoreOrFail(dir)
      try {
        const large = detectLargeTasks(store.toGraphDocument())
        for (const result of large) persistDecomposition(store, result, result.node.id)
        return { decomposed: large.length }
      } finally {
        store.close()
      }
    },
    gaps: async () => {
      const store = openStoreOrFail(dir)
      try {
        const required = detectAllGaps(store.toGraphDocument()).filter((g) => g.severity === 'required')
        return { required: required.length }
      } finally {
        store.close()
      }
    },
    brief: async () => {
      const store = openStoreOrFail(dir)
      try {
        const next = findNextTask(store.toGraphDocument(), { pierceContainers: true })
        return next ? buildExecutorBrief(store, next.node.id) : null
      } finally {
        store.close()
      }
    },
  }
}

describe('runGenesis — pipeline real em sandbox demo', () => {
  it('AC1+AC3: ideia de 1 frase → grafo com ≥1 épico e ≥3 tasks com AC + primeiro brief; 6 etapas com ms numérico', async () => {
    // Arrange
    const sandbox = createDemoSandbox()
    try {
      // Act
      const report = await runGenesis(IDEA, realHandlers(sandbox.path))

      // Assert — envelope honesto e completo (AC3)
      expect(report.ok).toBe(true)
      expect(report.failedStep).toBeUndefined()
      expect(report.steps.map((s) => s.name)).toEqual([...GENESIS_STEP_NAMES])
      for (const step of report.steps) {
        expect(step.ok).toBe(true)
        expect(typeof step.ms).toBe('number')
        expect(step.ms).toBeGreaterThanOrEqual(0)
      }

      // Assert — primeiro brief presente no envelope (AC1)
      expect(report.firstBrief).toBeTruthy()
      expect(report.firstBrief!.task.title.length).toBeGreaterThan(0)
      expect(report.imported!.nodes).toBeGreaterThan(0)

      // Assert — grafo resultante: ≥1 épico e ≥3 tasks com AC (AC1)
      const store = openStoreOrFail(sandbox.path)
      try {
        const doc = store.toGraphDocument()
        const epics = doc.nodes.filter((n) => n.type === 'epic')
        const tasksWithAc = doc.nodes.filter((n) => n.type === 'task' && getNodeAcTexts(doc, n.id).length > 0)
        expect(epics.length).toBeGreaterThanOrEqual(1)
        expect(tasksWithAc.length).toBeGreaterThanOrEqual(3)
      } finally {
        store.close()
      }
    } finally {
      sandbox.cleanup()
    }
  })

  it('AC2: decompose forçada a falhar no stub → ok:false com etapas anteriores ok:true e nada após a falha', async () => {
    // Arrange
    const sandbox = createDemoSandbox()
    try {
      const handlers = realHandlers(sandbox.path)
      handlers.decompose = async () => {
        throw new Error('decompose forçado a falhar')
      }

      // Act
      const report = await runGenesis(IDEA, handlers)

      // Assert — nunca ok:true com falha interna
      expect(report.ok).toBe(false)
      expect(report.failedStep).toBe('decompose')
      expect(report.steps.map((s) => ({ name: s.name, ok: s.ok }))).toEqual([
        { name: 'init', ok: true },
        { name: 'generate_prd', ok: true },
        { name: 'import_prd', ok: true },
        { name: 'decompose', ok: false },
      ])
      expect(report.steps.at(-1)!.error).toContain('decompose forçado a falhar')
      expect(report.firstBrief).toBeUndefined()
    } finally {
      sandbox.cleanup()
    }
  })
})

describe('runGenesis — unidade pura (stubs, relógio injetado)', () => {
  it('mede ms por etapa com o relógio injetado (determinismo)', async () => {
    // Arrange — relógio fake: cada chamada avança 7ms
    let tick = 0
    const now = (): number => {
      tick += 7
      return tick
    }
    const handlers: GenesisHandlers<string> = {
      init: async () => undefined,
      generatePrd: async (idea) => `# PRD de ${idea}`,
      importPrd: async () => ({ nodes: 4, edges: 3 }),
      decompose: async () => ({ decomposed: 0 }),
      gaps: async () => ({ required: 0 }),
      brief: async () => 'brief-stub',
    }

    // Act
    const report = await runGenesis('ideia', handlers, now)

    // Assert
    expect(report.ok).toBe(true)
    expect(report.steps).toHaveLength(6)
    for (const step of report.steps) expect(step.ms).toBe(7)
    expect(report.firstBrief).toBe('brief-stub')
    expect(report.decomposed).toBe(0)
    expect(report.requiredGaps).toBe(0)
    expect(report.imported).toEqual({ nodes: 4, edges: 3 })
  })
})
