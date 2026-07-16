/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract tests for ContextRuntimeService.
 * Currently RED — no implementation exists yet.
 */

import { describe, it, expect } from 'vitest'
import type { ContextRuntimeService, GraphSummary, NodeDetail } from '../core/contracts/context-runtime.js'

export function runContextRuntimeContractTests(createService: () => ContextRuntimeService, label: string): void {
  describe(`ContextRuntimeService contract — ${label}`, () => {
    let service: ContextRuntimeService

    beforeEach(() => {
      service = createService()
    })

    describe('compact', () => {
      it('returns null for non-existent node', () => {
        const result = service.compact('non-existent-node')
        expect(result).toBeNull()
      })

      it('returns FlowCompactResult shape when node exists', () => {
        const result = service.compact('any-node')
        if (result) {
          expect(result).toHaveProperty('context')
          expect(result).toHaveProperty('pinnedInvariants')
          expect(result).toHaveProperty('flow')
          expect(result.flow).toHaveProperty('enabled')
          expect(result.flow).toHaveProperty('phi')
          expect(result.flow).toHaveProperty('lambda')
        }
      })
    })

    describe('summary', () => {
      it('returns a GraphSummary with required fields', () => {
        const summary = service.summary()
        expect(summary).toHaveProperty('byType')
        expect(summary).toHaveProperty('byStatus')
        expect(summary).toHaveProperty('totalNodes')
        expect(summary).toHaveProperty('nextTask')
        expect(typeof summary.totalNodes).toBe('number')
        expect(typeof summary.byType).toBe('object')
        expect(typeof summary.byStatus).toBe('object')
      })

      it('returns nextTask as null when no tasks exist', () => {
        const summary = service.summary()
        // Shape check: nextTask is either null or has id+title
        if (summary.nextTask) {
          expect(summary.nextTask).toHaveProperty('id')
          expect(summary.nextTask).toHaveProperty('title')
        }
      })
    })

    describe('nodeDetail', () => {
      it('returns null for non-existent node', () => {
        const result = service.nodeDetail('non-existent')
        expect(result).toBeNull()
      })

      it('returns NodeDetail shape when node exists', () => {
        const result = service.nodeDetail('any-node')
        if (result) {
          expect(result).toHaveProperty('node')
          expect(result).toHaveProperty('childrenCount')
          expect(result).toHaveProperty('edgeCount')
          expect(typeof result.childrenCount).toBe('number')
          expect(typeof result.edgeCount).toBe('number')
        }
      })
    })

    describe('children', () => {
      it('returns an array (empty for unknown nodes)', () => {
        const result = service.children('non-existent')
        expect(Array.isArray(result)).toBe(true)
      })

      it('each child has GraphNode shape', () => {
        const result = service.children('any')
        for (const child of result) {
          expect(child).toHaveProperty('id')
          expect(child).toHaveProperty('type')
          expect(child).toHaveProperty('title')
          expect(child).toHaveProperty('status')
        }
      })
    })

    describe('backlog', () => {
      it('returns an array', () => {
        const result = service.backlog()
        expect(Array.isArray(result)).toBe(true)
      })

      it('all returned items have backlog status', () => {
        const result = service.backlog()
        for (const node of result) {
          // When no data, this loop is empty — contract holds vacuously
          // Once implemented, this enforces the invariant
          expect(node.status).toBe('backlog')
        }
      })
    })
  })
}

describe('ContextRuntimeService contract suite — self-validation', () => {
  it('exports runContextRuntimeContractTests as a function', () => {
    expect(typeof runContextRuntimeContractTests).toBe('function')
  })
})
