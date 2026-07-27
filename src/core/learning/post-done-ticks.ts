/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * post-done-ticks — the colony's learning steps that run AFTER a task is closed.
 *
 * WHY it lives apart from the done command: these are stigmergy concerns
 * (evaporate pheromone, measure convergence, evolve the selection genome), not
 * part of deciding whether a task may close. Keeping them here leaves the command
 * about the gate decisions and gives the ticks a place that can be tested on its
 * own.
 *
 * CONTRACT — never throws, never blocks. A learning step that fails must not cost
 * the user a delivery they already earned, so every call is defensive and the
 * worst case is that this cycle simply teaches the colony nothing.
 *
 * Composes with: aco stagnation control, ga autotune, and `done-cmd.ts` (its only
 * caller today).
 */

import { spawnSync } from 'node:child_process'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'
import { SuccessPatternTracker, derivePatternKey, buildStrategyMemory } from '../harness/success-pattern-tracker.js'
import { writeMemory } from '../memory/memory-reader.js'
import { buildCaseMemory } from '../memory/case-distillation.js'
import { recordInManifest } from '../hooks/session-manifest.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildColonyHealthSnapshot } from '../web/colony-health-snapshot.js'
import { buildColonyHealthMemoryName } from '../colony/colony-health-history.js'
import { insertEpisodicOutcome } from '../store/episodic-outcomes-store.js'
import { generateId } from '../utils/id.js'
import { STORE_DIR } from '../utils/constants.js'
import { type StagnationDecision } from '../economy/mmas-pheromone.js'
import { runGaTick } from '../economy/ga-tick.js'
import { runStagnationTick } from '../economy/stagnation-tick.js'
import { isLeverEnabled, resolveEconomyLeversConfig } from '../economy/economy-levers-config.js'

/** Outcome of the post-done learning pass; `stagnation` is absent when the lever is off. */
export interface PostDoneLearning {
  stagnation?: StagnationDecision
}

/**
 * Run the colony learning ticks for a just-closed task.
 *
 * Stagnation control runs first, in MMAS order: evaporate ρ, measure colony
 * entropy, then re-diversify if the search has converged too far (or recommend a
 * higher α if it is too diffuse). It runs UNCONDITIONALLY — MMAS bounds and reset
 * are default-ON — and always returns a decision; the `aco_autotune` lever only
 * decides whether the tick also records an economy_lever_ledger row. (This
 * docblock previously claimed the lever gated the whole tick, which the code at
 * stagnation-tick.ts:46 contradicts: the decision is computed before the flag is
 * ever read.)
 *
 * GA autotune then evolves that genome from real selection episodes and persists
 * it, so the next pull selects with a learned α. It engages on its own once there
 * are enough episodes — deliberately no lever to flip, since a capability nobody
 * turns on delivers nothing.
 */
export function runPostDoneLearning(store: SqliteStore, taskId: string): PostDoneLearning {
  let stagnation: StagnationDecision | undefined

  try {
    const leverEnabled = isLeverEnabled(resolveEconomyLeversConfig(store), 'aco_autotune')
    stagnation =
      runStagnationTick(store.getDb(), store.getProject()?.id ?? '', { leverEnabled, nodeId: taskId }) ?? undefined
  } catch {
    /* stagnation control never breaks done */
  }

  try {
    runGaTick(store)
  } catch {
    /* GA autotune never breaks done */
  }

  return stagnation ? { stagnation } : {}
}

/**
 * Escreve as memórias experienciais de uma entrega nota A.
 *
 * Duas memórias distintas, deliberadamente: a AGREGADA (padrão que se repete
 * entre tasks, via SuccessPatternTracker) e a POR-TASK (o caso concreto, via
 * case-distillation). A segunda só sai quando há racional real e testFiles
 * observados — sem isso a memória descreveria uma entrega que ninguém pode
 * reconstituir.
 *
 * CONTRATO: nunca bloqueia. A entrega já foi ganha quando isto roda; falhar ao
 * registrar a lição não pode custar ao usuário o fechamento da task. Só entrega
 * nota A alimenta a memória — registrar tudo dilui o sinal que o próximo executor
 * lê.
 */
export function recordSuccessLearning(input: {
  store: SqliteStore
  node: GraphNode
  dir: string
  grade: string
  score: number
}): void {
  if (input.grade !== 'A') return
  const { store, node, dir, score } = input

  try {
    const patternKey = derivePatternKey(node)
    const result = new SuccessPatternTracker(store.getDb()).recordSuccess(
      patternKey,
      node.id,
      `Grade A DoD (score ${score}) on "${node.title}"`,
    )
    if (result.shouldEmit && patternKey) {
      const memory = buildStrategyMemory({
        patternKey,
        nodeIds: result.contributingNodeIds,
        rationales: result.contributingRationales,
      })
      // writeMemory anexa .md e resolve sob <dir>/workflow-graph/memories/ —
      // passar o nome nu.
      void writeMemory(dir, memory.name, memory.content).catch(() => {
        /* memória nunca bloqueia done */
      })
    }
  } catch {
    /* success-pattern nunca bloqueia done */
  }

  try {
    const caseMemory = buildCaseMemory({
      node,
      grade: input.grade,
      rationale: node.description ?? '',
      testFiles: node.testFiles ?? [],
    })
    if (caseMemory.shouldWrite && caseMemory.name && caseMemory.content) {
      void writeMemory(dir, caseMemory.name, caseMemory.content).catch(() => {
        /* memória nunca bloqueia done */
      })
    }
  } catch {
    /* case-distillation nunca bloqueia done */
  }
}

/**
 * Registra os arquivos tocados no manifesto da sessão (verificação de integridade).
 *
 * Deriva a lista do git em vez de confiar no que a task declarou: o manifesto
 * existe justamente para cruzar o que foi PROMETIDO contra o que MUDOU, então ler
 * a declaração aqui destruiria a checagem. Best-effort, com timeout — um git lento
 * não segura o fechamento.
 */
export function recordDoneInManifest(taskId: string, dir: string): void {
  try {
    const diff = spawnSync('git', ['diff', '--name-only', '--diff-filter=MARD', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 5000,
    })
    const files = diff.stdout?.trim().split('\n').filter(Boolean) ?? []
    recordInManifest(`done ${taskId}`, 0, files.length, files, undefined, taskId)
  } catch {
    /* manifesto nunca bloqueia done */
  }
}

/**
 * Snapshot da saúde da colônia + telemetria episódica do sucesso.
 *
 * Os dois alimentam decisões FUTURAS — o snapshot dá a série temporal que mostra
 * a colônia melhorando ou degradando, e o episódio faz Φ(flow) subir para o
 * próximo turno. Nenhum dos dois influencia a task que acabou de fechar, e é por
 * isso que ambos são best-effort: gravar história não pode custar a entrega.
 */
export function recordColonyOutcome(store: SqliteStore, node: GraphNode, dir: string): void {
  try {
    const snapshot = buildColonyHealthSnapshot(store.getStats())
    const memDir = join(dir, STORE_DIR, 'memories')
    mkdirSync(memDir, { recursive: true })
    writeFileSync(
      join(memDir, `${buildColonyHealthMemoryName(new Date())}.md`),
      JSON.stringify({ ...snapshot, taskId: node.id, date: new Date().toISOString() }, null, 2),
      'utf-8',
    )
  } catch {
    /* colony health snapshot nunca bloqueia done */
  }

  try {
    insertEpisodicOutcome(store.getDb(), {
      id: generateId('epi'),
      nodeId: node.id,
      taskType: (node.type as string) ?? '',
      tags: '',
      approachSummary: 'done',
      outcome: 'success',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: Date.now(),
    })
  } catch {
    /* telemetry nunca bloqueia done */
  }
}
