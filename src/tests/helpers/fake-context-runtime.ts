/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeContextRuntimeService — in-memory, deterministic fake for testing.
 * Implements ContextRuntimeService contract. Never touches SQLite or MCP.
 */

import type { ContextRuntimeService, GraphSummary, NodeDetail } from '../../core/contracts/context-runtime.js'
import type { GraphNode } from '../../core/graph/graph-types.js'
import type { FlowCompactResult, FlowBlock } from '../../core/context/flow-compact.js'

export class FakeContextRuntimeService implements ContextRuntimeService {
  private nodes: Map<string, GraphNode> = new Map()

  seed(nodes: GraphNode[]): void {
    for (const node of nodes) {
      this.nodes.set(node.id, node)
    }
  }

  // ── ContextRuntimeService ─────────────────────────────

  compact(nodeId: string): FlowCompactResult | null {
    const node = this.nodes.get(nodeId)
    if (!node) return null

    const flow: FlowBlock = {
      enabled: true,
      mode: 'flow_on',
      phi: 0.5,
      streak: 0,
      lambda: 0.75,
      prunedCount: 0,
      pinnedCount: 0,
      tokensBaseline: 100,
      tokensActual: 80,
      tokensSaved: 20,
    }

    return {
      context: {
        task: {
          id: node.id,
          title: node.title,
          status: node.status,
          type: node.type,
          priority: node.priority,
          description: node.description,
        },
        acceptanceCriteria: node.acceptanceCriteria ?? [],
        children: this.children(nodeId),
        blockers: [],
        dependsOn: [],
      },
      pinnedInvariants: [],
      flow,
    }
  }

  summary(): GraphSummary {
    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const node of this.nodes.values()) {
      byType[node.type] = (byType[node.type] ?? 0) + 1
      byStatus[node.status] = (byStatus[node.status] ?? 0) + 1
    }
    const next = this.findNext()
    return {
      byType,
      byStatus,
      totalNodes: this.nodes.size,
      nextTask: next ? { id: next.id, title: next.title } : null,
    }
  }

  nodeDetail(nodeId: string): NodeDetail | null {
    const node = this.nodes.get(nodeId)
    if (!node) return null
    return {
      node,
      childrenCount: this.children(nodeId).length,
      edgeCount: 0,
    }
  }

  children(nodeId: string): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.parentId === nodeId)
  }

  backlog(): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.status === 'backlog').sort((a, b) => a.priority - b.priority)
  }

  // ── helpers ───────────────────────────────────────────

  private findNext(): GraphNode | null {
    const candidates = this.backlog().filter((n) => n.type === 'task' || n.type === 'subtask')
    return candidates[0] ?? null
  }
}
