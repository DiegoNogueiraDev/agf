/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Prova no modo do consumidor (node_c8e03f45cc43, B4 da federação — regra 16):
 * um projeto FRESCO importa um LearningBundle e a seleção ACO real
 * (selectNextTaskSmart, o caminho que o `agf next --aco` percorre) USA o
 * pheromone herdado — evidência física = episódio de seleção gravado com
 * pheromone>0 no candidato da tag herdada. Controle sem import prova o delta.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { exportLearning, importLearning } from '../core/knowledge/knowledge-packager.js'
import { selectNextTaskSmart } from '../core/planner/aco-select.js'
import { readSelectionEpisodes } from '../core/economy/selection-quality.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function freshProject(name: string): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject(name)
  return store
}

function addTask(store: SqliteStore, id: string, tags: string[]): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: ['Given X, When Y, Then Z'],
    tags,
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

function selectWithAco(store: SqliteStore, seed: number) {
  return selectNextTaskSmart(store.toGraphDocument(), {
    getDb: () => store.getDb(),
    getProjectId: () => store.getProject()?.id ?? 'default',
    mode: 'on',
    rng: seededRng(seed),
  })
}

interface EpisodeCandidate {
  id: string
  pheromone: number
}

function lastEpisodeCandidates(store: SqliteStore): EpisodeCandidate[] {
  const episodes = readSelectionEpisodes(store.getDb(), store.getProject()?.id ?? 'default', 1)
  expect(episodes.length).toBeGreaterThan(0)
  return episodes[0].candidates as EpisodeCandidate[]
}

describe('federação e2e — seleção ACO usa pheromone herdado (modo do consumidor)', () => {
  it('projeto fresco + bundle importado: candidato da tag herdada tem pheromone>0 no episódio (AC1)', () => {
    // Projeto-fonte com trilha forte na tag 'cli'
    const src = freshProject('fed-e2e-src')
    depositPheromone(src.getDb(), src.getProject()!.id, 'cli', 8)
    const bundle = exportLearning(src.getDb(), src.getProject()!.id)
    src.close()

    // Projeto-alvo fresco herda e seleciona pelo caminho real do picker
    const dst = freshProject('fed-e2e-dst')
    importLearning(dst.getDb(), dst.getProject()!.id, bundle, { nowMs: Date.now() })
    addTask(dst, 'node_cli_task', ['cli'])
    addTask(dst, 'node_web_task', ['web'])

    const picked = selectWithAco(dst, 42)
    expect(picked).not.toBeNull()

    const candidates = lastEpisodeCandidates(dst)
    const cliCandidate = candidates.find((c) => c.id === 'node_cli_task')
    expect(cliCandidate?.pheromone ?? 0).toBeGreaterThan(0)
    dst.close()
  })

  it('controle sem import: pheromone=0 em todos os candidatos (prova do delta herdado, AC2)', () => {
    const dst = freshProject('fed-e2e-control')
    addTask(dst, 'node_cli_task', ['cli'])
    addTask(dst, 'node_web_task', ['web'])

    const picked = selectWithAco(dst, 42)
    expect(picked).not.toBeNull()

    const candidates = lastEpisodeCandidates(dst)
    for (const c of candidates) expect(c.pheromone).toBe(0)
    dst.close()
  })

  it('bundle vazio importado (caso de limite): seleção cai no caminho determinístico sem lançar (AC3)', () => {
    const src = freshProject('fed-e2e-empty-src')
    const emptyBundle = exportLearning(src.getDb(), src.getProject()!.id)
    src.close()

    const dst = freshProject('fed-e2e-empty-dst')
    importLearning(dst.getDb(), dst.getProject()!.id, emptyBundle, { nowMs: Date.now() })
    addTask(dst, 'node_only', ['cli'])

    const picked = selectWithAco(dst, 7)
    expect(picked?.node.id).toBe('node_only')
    dst.close()
  })
})
