/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * ant-swarming `spawn` — N formigas = N worktrees + registro na sessão swarm.
 *
 * PORQUÊ: em árvore compartilhada o paralelismo satura em ~3-5 formigas; cada
 * formiga precisa de um worktree próprio (memória ant-protocol-shared-graph).
 * Este orquestrador REUSA o provisionamento de core/swarm/worktree-provision
 * (a mesma fonte única que `agf ant spawn` usa) e registra cada formiga numa
 * sessão via SwarmCoordinator (+ lease via AgentClaimManager) — do not recreate.
 *
 * ISOLAMENTO: importa SÓ de core/swarm. Idempotente (worktree vivo reusado; join
 * idempotente por session:agent). Valida o id contra path traversal ANTES de
 * qualquer efeito no disco/grafo.
 */

import type Database from 'better-sqlite3'
import { SwarmCoordinator } from '../core/swarm/swarm-coordinator.js'
import { AgentClaimManager } from '../core/swarm/agent-claim-manager.js'
import {
  provisionAntWorktree,
  resolveRepoRoot,
  isSafeAntId,
  AntProvisionError,
  type AntWorktree,
} from '../core/swarm/worktree-provision.js'

export interface SpawnOptions {
  db: Database.Database
  /** Diretório do projeto (resolve a raiz do repo git). */
  dir: string
  /** Nº de formigas a provisionar. */
  ants: number
  /** Prefixo dos ids gerados (`<base>-1`, `<base>-2`, …). Default: 'ant'. */
  baseId?: string
}

export interface SpawnResult {
  sessionId: string
  /** Nº de agentes registrados na sessão (== ants provisionadas). */
  count: number
  ants: AntWorktree[]
}

/**
 * Provisiona `opts.ants` worktrees e registra cada formiga na sessão swarm.
 * @throws {AntProvisionError} NOT_A_GIT_REPO · INVALID_ANT_ID (nenhum efeito
 *   parcial: a base é validada antes de criar a sessão ou qualquer worktree).
 */
export function runSpawn(opts: SpawnOptions): SpawnResult {
  const repoRoot = resolveRepoRoot(opts.dir)
  if (!repoRoot) {
    throw new AntProvisionError('NOT_A_GIT_REPO', `Sem repositório git em ${opts.dir}`)
  }
  const base = opts.baseId ?? 'ant'
  // AC3: valida a base ANTES de criar sessão/worktree — id com traversal ⇒ zero efeito.
  if (!isSafeAntId(base)) {
    throw new AntProvisionError('INVALID_ANT_ID', `base id inválido: "${base}" (use [a-z0-9._-])`)
  }

  const coordinator = new SwarmCoordinator(opts.db)
  const session = coordinator.init({
    topology: 'mesh',
    consensus: 'majority',
    maxAgents: Math.max(opts.ants, 1),
  })
  const claims = new AgentClaimManager(opts.db)

  const ants: AntWorktree[] = []
  for (let i = 1; i <= opts.ants; i++) {
    const id = `${base}-${i}`
    const wt = provisionAntWorktree(repoRoot, id)
    coordinator.join(session.id, { agentId: id, role: 'worker' })
    // Lease best-effort: sinaliza posse; um conflito não bloqueia o spawn.
    claims.tryClaim(`${session.id}:${id}`, id)
    ants.push(wt)
  }

  return { sessionId: session.id, count: coordinator.agentCount(session.id), ants }
}
