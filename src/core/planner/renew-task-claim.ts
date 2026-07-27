/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * renewTaskClaim — o dono renova a lease da própria task em voo
 * (node_728743c96bd9; mitiga o risk node_cf74a021bb25: TTL 300s << duração de
 * qualquer task TDD e nada renovava).
 *
 * Wire do LockManager.renew (antes dormente): comandos que o dono roda no meio
 * do trabalho (check, node status in_progress) chamam isto com a identidade
 * resolvida (--agent/AGF_AGENT_ID). Sem identidade ⇒ no-op byte-idêntico.
 * Mismatch de dono ⇒ no-op + dono nomeado no retorno (o caller loga warning,
 * nunca erro). Lease expirada ⇒ no-op (terra de ninguém: o caminho certo é um
 * claim novo, não renew).
 *
 * Espelha release-task-claim.ts (mesma família de wiring); usa o resource_id
 * COM prefixo `task:` — o mesmo formato que claimNextTask adquire (o release
 * legado sem prefixo é o bug node_884a33abee66).
 */

import type Database from 'better-sqlite3'
import { taskResourceId } from './task-resource-key.js'
import { LockManager } from '../store/lock-manager.js'

export interface RenewClaimResult {
  renewed: boolean
  mismatch: boolean
  /** Dono real da lease quando mismatch=true. */
  agentId?: string
  /** Novo expiresAt (ISO-8601) quando renewed=true. */
  expiresAt?: string
}

interface LockRow {
  lease_token: string
  agent_id: string
}

/** Renova a lease viva de `task:<taskId>` se — e só se — o caller é o dono. */
export function renewTaskClaim(
  db: Database.Database,
  taskId: string,
  callerAgentId: string | undefined,
  ttlSeconds?: number,
): RenewClaimResult {
  if (!callerAgentId) return { renewed: false, mismatch: false }

  const now = new Date().toISOString()
  const row = db
    .prepare('SELECT lease_token, agent_id FROM resource_locks WHERE resource_id = ? AND expires_at > ?')
    .get(taskResourceId(taskId), now) as LockRow | undefined

  if (!row) return { renewed: false, mismatch: false }
  if (row.agent_id !== callerAgentId) return { renewed: false, mismatch: true, agentId: row.agent_id }

  new LockManager(db).renew(row.lease_token, ttlSeconds)
  const updated = db.prepare('SELECT expires_at FROM resource_locks WHERE lease_token = ?').get(row.lease_token) as
    { expires_at: string } | undefined
  return { renewed: true, mismatch: false, expiresAt: updated?.expires_at }
}

/**
 * Dono da lease VIVA de `task:<taskId>`, ou null (sem lease / expirada).
 * node_0c28154d4517 — o anti-hijack usa isto para distinguir a janela de
 * atomicidade do pull (lease viva ⇒ dono vale mesmo com a task em backlog)
 * de um dono órfão (lease morta + task nunca voou ⇒ assumível sem --force).
 */
export function activeTaskLeaseOwner(db: Database.Database, taskId: string): string | null {
  const now = new Date().toISOString()
  const row = db
    .prepare('SELECT agent_id FROM resource_locks WHERE resource_id = ? AND expires_at > ?')
    .get(taskResourceId(taskId), now) as { agent_id: string } | undefined
  return row?.agent_id ?? null
}
