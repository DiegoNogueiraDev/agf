/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf implementer <nodeId>` — agent-attributed lifecycle transition on a task.
 *
 * Boundary for external/agent-driven start|progress|done signals (e.g. a swarm
 * member or bridge integration reporting its own activity on a node), validated
 * via the Zod schema in core/implementer/validation.ts before touching the store.
 * `start`/`done` reuse the same status_flow + honest-done rules as `agf node
 * status`; `progress` (or an omitted action) only attributes the agent without
 * moving the node's status.
 */

import { Command } from 'commander'
import { ZodError } from 'zod/v4'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { validateImplementerInput } from '../../core/implementer/validation.js'
import { validateStatusTransition } from './node-cmd.js'
import { isHonestDoneTransition } from '../../core/planner/external-blocker.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'

function withStore<T>(dir: string, fn: (store: SqliteStore) => T): T {
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    return fn(store)
  } finally {
    store.close()
  }
}

/** Builds the `agf implementer` CLI command (Commander definition). */
export function implementerCommand(): Command {
  const cmd = new Command('implementer')
  cmd.description('Transição de lifecycle atribuída a um agente (start/progress/done), com validação de boundary')
  cmd.argument('<nodeId>', 'ID do nó')
  cmd.option('--action <action>', 'start|progress|done')
  cmd.option('--agent-id <id>', 'ID do agente que está reportando a ação')
  cmd.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
  cmd.action((nodeIdArg: string, opts: { action?: string; agentId?: string; dir: string }) => {
    const out = createCliOutput('implementer')

    let input
    try {
      input = validateImplementerInput({ nodeId: nodeIdArg, action: opts.action, agentId: opts.agentId })
    } catch (err) {
      const message = err instanceof ZodError ? err.issues.map((i) => i.message).join('; ') : String(err)
      out.err('VALIDATION_ERROR', `Input inválido: ${message}`)
      return
    }

    withStore(opts.dir, (store) => {
      const node = store.getNodeById(input.nodeId)
      if (!node) {
        out.err('NOT_FOUND', `Nó não encontrado: ${input.nodeId}`)
        return
      }

      const action = input.action ?? 'progress'
      if (action === 'progress') {
        const updated = input.agentId
          ? store.updateNode(input.nodeId, { metadata: { ...node.metadata, lastAgentId: input.agentId } })
          : node
        out.ok({ id: input.nodeId, action, status: updated?.status ?? node.status, agentId: input.agentId })
        return
      }

      const to = action === 'start' ? 'in_progress' : 'done'
      if (to === 'done' && !isHonestDoneTransition(node, to)) {
        out.err(
          'EXTERNAL_BLOCKED_DONE',
          `Nó "${input.nodeId}" está bloqueado por infra/externo e não pode ser marcado done.`,
        )
        return
      }
      const transitionErr = validateStatusTransition(node.status, to)
      if (transitionErr) {
        out.err('INVALID_TRANSITION', transitionErr)
        return
      }
      store.updateNodeStatus(input.nodeId, to)
      if (input.agentId) {
        store.updateNode(input.nodeId, { metadata: { ...node.metadata, lastAgentId: input.agentId } })
      }
      out.ok({ id: input.nodeId, action, from: node.status, to, agentId: input.agentId })
    })
  })
  return cmd
}
