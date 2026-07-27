/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Porta do autopilot sobre o `SqliteStore` + DoD — adapta o store à interface
 * `AutopilotGraphPort` (next/markInProgress/checkDone/markDone). Compartilhada
 * entre o comando `autopilot` (CLI) e a TUI (M1r); extraída para evitar
 * duplicação.
 */
import { findNextTask } from '../../core/planner/next-task.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import type { AutopilotGraphPort } from '../../core/autonomy/autopilot-loop.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { emitTaskHookSync } from '../../core/hooks/hook-runtime.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'store-port.ts' })

/** Porta real do autopilot sobre o SqliteStore + DoD. */
export function makeStorePort(store: SqliteStore): AutopilotGraphPort {
  log.debug('creating store port')
  return {
    nextTask() {
      const r = findNextTask(store.toGraphDocument())
      if (!r) return null
      if (r.warning === 'all_tasks_blocked') return { warning: 'all_tasks_blocked' }
      return { id: r.node.id, title: r.node.title }
    },
    markInProgress(id) {
      // Emite pre-execute ANTES de marcar in_progress (WIP guard conta correto).
      const node = store.getNodeById(id)
      emitTaskHookSync(store, 'task:pre-execute', { nodeId: id, title: node?.title ?? '', taskKind: node?.type })
      store.updateNodeStatus(id, 'in_progress')
    },
    checkDone(id) {
      const dod = checkDefinitionOfDone(store.toGraphDocument(), id)
      const failedRequired = dod.checks.filter((c) => !c.passed && c.severity === 'required').map((c) => c.name)
      return { ready: dod.ready, failedRequired }
    },
    markDone(id) {
      store.updateNodeStatus(id, 'done')
      const node = store.getNodeById(id)
      // Hook: autopilot concluiu a task → learning persiste o PerfRecord.
      emitTaskHookSync(store, 'task:post-complete', { nodeId: id, title: node?.title ?? '' })
    },
  }
}
