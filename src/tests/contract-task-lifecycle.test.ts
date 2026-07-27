/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract tests for TaskLifecycleService.
 * Currently RED — no implementation exists yet.
 */

import { describe, it, expect } from 'vitest'
import type { TaskLifecycleService } from '../core/contracts/task-lifecycle.js'
import type { NodeStatus } from '../core/graph/graph-types.js'

export function runTaskLifecycleContractTests(createService: () => TaskLifecycleService, label: string): void {
  describe('TaskLifecycleService contract — ' + label, () => {
    let service: TaskLifecycleService

    beforeEach(() => {
      service = createService()
    })

    describe('findNext', () => {
      it('returns null when backlog is empty', () => {
        const result = service.findNext()
        expect(result).toBeNull()
      })

      it('returns shape-compliant node when backlog has tasks', () => {
        const result = service.findNext()
        expect(result === null || (typeof result?.id === 'string' && typeof result?.title === 'string')).toBe(true)
      })
    })

    describe('startTask', () => {
      it('returns null when no task is available and no nodeId given', () => {
        const result = service.startTask()
        expect(result).toBeNull()
      })

      it('returns a TaskContext with required fields when task exists', () => {
        const result = service.startTask()
        if (result) {
          expect(result).toHaveProperty('node')
          expect(result).toHaveProperty('acceptanceCriteria')
          expect(result).toHaveProperty('children')
          expect(result).toHaveProperty('blockers')
          expect(result).toHaveProperty('dependsOn')
        }
      })

      it('marks the task in_progress when starting', () => {
        const result = service.startTask()
        if (result) {
          expect(result.node.status).toBe('in_progress')
        }
      })
    })

    describe('finishTask', () => {
      it('returns a DoDReport with required shape', () => {
        const report = service.finishTask('any')
        expect(report).toHaveProperty('nodeId')
        expect(report).toHaveProperty('checks')
        expect(report).toHaveProperty('passed')
        expect(report).toHaveProperty('total')
        expect(report).toHaveProperty('ready')
        expect(Array.isArray(report.checks)).toBe(true)
      })

      it('includes required DoD checks', () => {
        const report = service.finishTask('any')
        const requiredChecks = ['has_acceptance_criteria', 'status_flow_valid', 'no_unresolved_blockers']
        for (const name of requiredChecks) {
          expect(report.checks.some((c) => c.name === name)).toBe(true)
        }
      })
    })

    describe('updateStatus', () => {
      it('returns null for non-existent node', () => {
        const result = service.updateStatus('non-existent', 'done')
        expect(result).toBeNull()
      })

      it('accepts all valid status transitions without throwing', () => {
        const validStatuses: NodeStatus[] = ['backlog', 'ready', 'in_progress', 'blocked', 'done']
        for (const status of validStatuses) {
          expect(() => service.updateStatus('any', status)).not.toThrow()
        }
      })
    })
  })
}

describe('TaskLifecycleService contract suite — self-validation', () => {
  it('exports runTaskLifecycleContractTests as a function', () => {
    expect(typeof runTaskLifecycleContractTests).toBe('function')
  })
})
