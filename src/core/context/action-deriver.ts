/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Derives the next-step action verdict from an assembled TaskContext.
 * WHY: pure function with no store dependency — isolated to keep task-context-builder
 * focused on assembly. Composing: compact-context-types.ts (types).
 */

import type { TaskContext, NextAction } from './compact-context-types.js'

/**
 * Derive the next-step verdict from an assembled context. Pure — no store, no
 * extra query; reads only the blockers / dependencies / status already present.
 * Precedence — an open blocker or unresolved dep ⇒ not ready (inspect the first
 * one); otherwise the own status decides the command (backlog→start,
 * in_progress→check, done→next).
 */
export function deriveNextAction(ctx: TaskContext): NextAction {
  const openBlockers = ctx.blockers.filter((b) => b.status !== 'done').map((b) => b.id)
  const unresolvedDeps = ctx.dependsOn.filter((d) => !d.resolved).map((d) => d.id)
  const blockedBy = [...openBlockers, ...unresolvedDeps]

  if (blockedBy.length > 0) {
    return {
      ready: false,
      blockedBy,
      reason: `${blockedBy.length} blocker(s)/dependência(s) pendente(s)`,
      suggestedCommand: `agf context ${blockedBy[0]}`,
    }
  }

  const id = ctx.task.id
  switch (ctx.task.status) {
    case 'in_progress':
    case 'active':
      return { ready: true, blockedBy, reason: 'em progresso — validar DoD', suggestedCommand: `agf check ${id}` }
    case 'done':
      return { ready: true, blockedBy, reason: 'concluída — puxar a próxima', suggestedCommand: 'agf next' }
    default:
      return { ready: true, blockedBy, reason: 'desbloqueada — pronta para iniciar', suggestedCommand: 'agf start' }
  }
}
