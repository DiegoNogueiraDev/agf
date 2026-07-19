/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeTaskLifecycleService — in-memory, deterministic fake for testing.
 * Implements TaskLifecycleService contract. Never touches SQLite or MCP.
 */

import type { TaskLifecycleService, DoDReport, TaskContext, DoDCheck } from '../../core/contracts/task-lifecycle.js'
import type { GraphNode, NodeStatus } from '../../core/graph/graph-types.js'
import { generateId } from '../../core/utils/id.js'

type FakeNode = GraphNode

export class FakeTaskLifecycleService implements TaskLifecycleService {
  private nodes: Map<string, FakeNode> = new Map()

  /** Seed the store with pre-existing nodes for test setup. */
  seed(nodes: FakeNode[]): void {
    for (const node of nodes) {
      this.nodes.set(node.id, node)
    }
  }

  addNode(node: Omit<FakeNode, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): FakeNode {
    const now = new Date().toISOString()
    const full: FakeNode = {
      ...node,
      id: node.id ?? 'node_' + generateId('fake'),
      status: node.status ?? 'backlog',
      priority: node.priority ?? 3,
      createdAt: node.createdAt ?? now,
      updatedAt: now,
    }
    this.nodes.set(full.id, full)
    return full
  }

  // ── TaskLifecycleService ──────────────────────────────

  startTask(nodeId?: string): TaskContext | null {
    let node: FakeNode | null = null
    if (nodeId) {
      node = this.nodes.get(nodeId) ?? null
    } else {
      node = this.findNextInternal()
    }
    if (!node) return null

    node = { ...node, status: 'in_progress', updatedAt: new Date().toISOString() }
    this.nodes.set(node.id, node)

    const children = this.getChildren(node.id)
    const blockers = this.getBlockers(node.id)
    const deps = this.getDependencies(node.id)

    return {
      node,
      acceptanceCriteria: node.acceptanceCriteria ?? [],
      children,
      blockers,
      dependsOn: deps.map((d) => ({
        nodeId: d.id,
        title: d.title,
        status: d.status,
        resolved: d.status === 'done',
      })),
    }
  }

  finishTask(nodeId: string, rationale?: string, testFiles?: string[]): DoDReport {
    const node = this.nodes.get(nodeId)
    if (!node) {
      return this.emptyReport(nodeId)
    }

    const checks: DoDCheck[] = this.runDoDChecks(node, testFiles)
    const passed = checks.filter((c) => c.passed).length
    const ready = checks.filter((c) => c.severity === 'required' || c.passed).length === checks.length

    if (!ready) {
      return { nodeId, title: node.title, checks, passed, total: checks.length, ready: false }
    }

    const updated = { ...node, status: 'done' as NodeStatus, updatedAt: new Date().toISOString() }
    this.nodes.set(nodeId, updated)

    let epicPromotion: DoDReport['epicPromotion'] | undefined
    if (node.parentId) {
      const siblings = this.getChildren(node.parentId)
      const allDone = siblings.every((s) => s.status === 'done' || s.id === nodeId)
      if (allDone && siblings.length > 0) {
        const parent = this.nodes.get(node.parentId)
        epicPromotion = { parentId: node.parentId, parentTitle: parent?.title ?? 'unknown', allChildrenDone: true }
      }
    }

    return { nodeId, title: node.title, checks, passed, total: checks.length, ready: true, epicPromotion }
  }

  updateStatus(nodeId: string, status: NodeStatus): GraphNode | null {
    const node = this.nodes.get(nodeId)
    if (!node) return null
    const updated = { ...node, status, updatedAt: new Date().toISOString() }
    this.nodes.set(nodeId, updated)
    return updated
  }

  findNext(): GraphNode | null {
    return this.findNextInternal()
  }

  // ── internals ─────────────────────────────────────────

  private findNextInternal(): FakeNode | null {
    const candidates = [...this.nodes.values()]
      .filter((n) => n.type === 'task' || n.type === 'subtask')
      .filter((n) => n.status === 'backlog')
      .sort((a, b) => a.priority - b.priority)
    return candidates[0] ?? null
  }

  private getChildren(parentId: string): FakeNode[] {
    return [...this.nodes.values()].filter((n) => n.parentId === parentId)
  }

  private getBlockers(nodeId: string): FakeNode[] {
    // In fake, blockers are nodes with "blocks" edges — simplified to parent-based lookup
    return [...this.nodes.values()].filter((n) => n.status === 'blocked' && n.parentId === nodeId)
  }

  private getDependencies(nodeId: string): FakeNode[] {
    // Simplified: return nodes that this one depends on (via parent chain)
    const node = this.nodes.get(nodeId)
    if (!node?.parentId) return []
    return [...this.nodes.values()].filter((n) => n.id === node.parentId)
  }

  private runDoDChecks(node: FakeNode, testFiles?: string[]): DoDCheck[] {
    return [
      {
        name: 'has_acceptance_criteria',
        severity: 'required',
        passed: (node.acceptanceCriteria?.length ?? 0) > 0,
        detail: `${node.acceptanceCriteria?.length ?? 0} AC items`,
      },
      {
        name: 'ac_quality_pass',
        severity: 'required',
        passed: (node.acceptanceCriteria?.length ?? 0) > 0,
        detail: 'quality assumed pass for fake',
      },
      {
        name: 'no_unresolved_blockers',
        severity: 'required',
        passed: node.status !== 'blocked',
        detail: node.status === 'blocked' ? 'Node is blocked' : 'No blockers',
      },
      {
        name: 'status_flow_valid',
        severity: 'required',
        passed: node.status === 'in_progress' || node.status === 'backlog',
        detail: `Current status: ${node.status}`,
      },
      {
        name: 'has_description',
        severity: 'recommended',
        passed: (node.description?.length ?? 0) > 0,
        detail: node.description ? 'Description present' : 'No description',
      },
      {
        name: 'has_test_files',
        severity: 'recommended',
        passed: (testFiles?.length ?? 0) > 0,
        detail: testFiles ? `${testFiles.length} files` : 'No test files provided',
      },
    ]
  }

  private emptyReport(nodeId: string): DoDReport {
    return {
      nodeId,
      title: 'unknown',
      checks: [
        { name: 'has_acceptance_criteria', severity: 'required', passed: false, detail: 'Node not found' },
        { name: 'ac_quality_pass', severity: 'required', passed: false, detail: 'Node not found' },
        { name: 'no_unresolved_blockers', severity: 'required', passed: false, detail: 'Node not found' },
        { name: 'status_flow_valid', severity: 'required', passed: false, detail: 'Node not found' },
      ],
      passed: 0,
      total: 4,
      ready: false,
    }
  }
}
