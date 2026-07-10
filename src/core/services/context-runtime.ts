/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * RealContextRuntimeService — production context queries backed by SqliteStore.
 * Implements ContextRuntimeService contract. compact() always goes through
 * applyFlowToCompact for flow dilution. flow_off preserves legacy.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { ContextRuntimeService, GraphSummary, NodeDetail } from '../contracts/context-runtime.js'
import type { GraphNode } from '../graph/graph-types.js'
import type { FlowCompactResult } from '../context/flow-compact.js'
import { applyFlowToCompact } from '../context/flow-compact.js'

export class RealContextRuntimeService implements ContextRuntimeService {
  constructor(private readonly store: SqliteStore) {}

  compact(nodeId: string): FlowCompactResult | null {
    return applyFlowToCompact(this.store, nodeId)
  }

  summary(): GraphSummary {
    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const nodes = this.store.getAllNodes()
    for (const node of nodes) {
      byType[node.type] = (byType[node.type] ?? 0) + 1
      byStatus[node.status] = (byStatus[node.status] ?? 0) + 1
    }

    const backlog = this.store
      .getNodesByStatus('backlog')
      .filter((n) => n.type === 'task' || n.type === 'subtask')
      .sort((a, b) => a.priority - b.priority)
    const nextTask = backlog[0] ?? null

    return {
      byType,
      byStatus,
      totalNodes: nodes.length,
      nextTask: nextTask ? { id: nextTask.id, title: nextTask.title } : null,
    }
  }

  nodeDetail(nodeId: string): NodeDetail | null {
    const node = this.store.getNodeById(nodeId)
    if (!node) return null

    return {
      node,
      childrenCount: this.store.getChildNodes(nodeId).length,
      edgeCount: this.store.getEdgesFrom(nodeId).length + this.store.getEdgesTo(nodeId).length,
    }
  }

  children(nodeId: string): GraphNode[] {
    return this.store.getChildNodes(nodeId)
  }

  backlog(): GraphNode[] {
    return this.store.getNodesByStatus('backlog').sort((a, b) => a.priority - b.priority)
  }
}
