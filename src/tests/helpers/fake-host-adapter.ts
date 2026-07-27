/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeHostAdapter — bridges fake services to simulate
 * the full runtime environment without real MCP/SQLite/CLI.
 * Used for integration testing of the hexagonal core.
 */

import { FakeTaskLifecycleService } from './fake-task-lifecycle'
import { FakeContextRuntimeService } from './fake-context-runtime'
import { FakeHumanGateService } from './fake-human-gate'
import { FakeWorkspaceStateService } from './fake-workspace-state'
import { FakeClock } from './fake-clock'
import { FakeMetricsStore } from './fake-metrics-store'
import { FakePermissionBroker } from './fake-permission-broker'
import { FakeQuestionBroker } from './fake-question-broker'
import type { GraphNode } from '../../core/graph/graph-types'

/**
 * FakeHostAdapter — wires all fakes into a complete test runtime.
 *
 * Usage:
 * ```ts
 * const host = new FakeHostAdapter()
 * host.seedNodes([{ id: 't1', type: 'task', title: 'Test', ... }])
 * const ctx = host.services.taskLifecycle.startTask('t1')
 * ```
 */
export class FakeHostAdapter {
  readonly clock = new FakeClock()
  readonly metrics = new FakeMetricsStore()
  readonly permissions = new FakePermissionBroker()
  readonly questions = new FakeQuestionBroker()
  readonly taskLifecycle = new FakeTaskLifecycleService()
  readonly contextRuntime = new FakeContextRuntimeService()
  readonly humanGate = new FakeHumanGateService()
  readonly workspaceState = new FakeWorkspaceStateService()

  readonly services = {
    taskLifecycle: this.taskLifecycle,
    contextRuntime: this.contextRuntime,
    humanGate: this.humanGate,
    workspaceState: this.workspaceState,
  }

  seedNodes(nodes: GraphNode[]): void {
    for (const node of nodes) {
      this.taskLifecycle.addNode(node)
      this.contextRuntime.seed([node])
    }
  }

  /** Reset all fakes to initial state. */
  reset(): void {
    this.metrics.reset()
    this.permissions.reset()
    this.questions.reset()
    // Other fakes don't have reset yet — create fresh ones
  }
}
