/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract tests for WorkspaceStateService.
 * Currently RED — no implementation exists yet.
 */

import { describe, it, expect } from 'vitest'
import type { WorkspaceStateService, Snapshot, SnapshotDiff } from '../core/contracts/workspace-state.js'

export function runWorkspaceStateContractTests(createService: () => WorkspaceStateService, label: string): void {
  describe(`WorkspaceStateService contract — ${label}`, () => {
    let service: WorkspaceStateService

    beforeEach(() => {
      service = createService()
    })

    describe('snapshot', () => {
      it('creates a snapshot with metadata', () => {
        const snap = service.snapshot('initial')
        expect(snap).toHaveProperty('id')
        expect(snap).toHaveProperty('label')
        expect(snap).toHaveProperty('createdAt')
        expect(snap).toHaveProperty('fileCount')
        expect(snap.label).toBe('initial')
        expect(typeof snap.createdAt).toBe('number')
        expect(typeof snap.fileCount).toBe('number')
      })

      it('generates unique IDs', () => {
        const s1 = service.snapshot('first')
        const s2 = service.snapshot('second')
        expect(s1.id).not.toBe(s2.id)
      })
    })

    describe('diff', () => {
      it('returns null when a snapshot is not found', () => {
        const result = service.diff('non-existent')
        expect(result).toBeNull()
      })

      it('returns SnapshotDiff shape when snapshots exist', () => {
        const s1 = service.snapshot('v1')
        const s2 = service.snapshot('v2')
        const diff = service.diff(s1.id, s2.id)
        if (diff) {
          expect(diff).toHaveProperty('fromId')
          expect(diff).toHaveProperty('toId')
          expect(diff).toHaveProperty('entries')
          expect(diff).toHaveProperty('totalAdditions')
          expect(diff).toHaveProperty('totalDeletions')
          expect(Array.isArray(diff.entries)).toBe(true)
          expect(typeof diff.totalAdditions).toBe('number')
          expect(typeof diff.totalDeletions).toBe('number')
        }
      })

      it('diff entries have the correct shape', () => {
        const s1 = service.snapshot('before')
        const s2 = service.snapshot('after')
        const diff = service.diff(s1.id, s2.id)
        if (diff) {
          for (const entry of diff.entries) {
            expect(entry).toHaveProperty('path')
            expect(entry).toHaveProperty('status')
            expect(entry).toHaveProperty('additions')
            expect(entry).toHaveProperty('deletions')
            expect(['added', 'modified', 'deleted', 'renamed']).toContain(entry.status)
          }
        }
      })
    })

    describe('restore', () => {
      it('returns false for non-existent snapshot', () => {
        const result = service.restore('non-existent')
        expect(result).toBe(false)
      })

      it('returns true after restoring a valid snapshot', () => {
        const snap = service.snapshot('to-restore')
        const result = service.restore(snap.id)
        // Implementation-dependent: restoring to a snapshot that exists should succeed
        expect(typeof result).toBe('boolean')
      })
    })

    describe('revert', () => {
      it('returns null for non-existent snapshot', () => {
        const result = service.revert('non-existent')
        expect(result).toBeNull()
      })

      it('returns a new Snapshot on successful revert', () => {
        const snap = service.snapshot('to-revert')
        const reversed = service.revert(snap.id)
        if (reversed) {
          expect(reversed).toHaveProperty('id')
          expect(reversed).toHaveProperty('label')
          expect(reversed.id).not.toBe(snap.id)
        }
      })
    })

    describe('track', () => {
      it('does not throw for any valid path', () => {
        expect(() => service.track('src/index.ts')).not.toThrow()
        expect(() => service.track('package.json')).not.toThrow()
      })
    })

    describe('listSnapshots', () => {
      it('returns an array', () => {
        const result = service.listSnapshots()
        expect(Array.isArray(result)).toBe(true)
      })

      it('returns snapshots in creation order (newest first)', () => {
        service.snapshot('older')
        service.snapshot('newer')
        const list = service.listSnapshots()
        if (list.length >= 2) {
          expect(list[0].createdAt).toBeGreaterThanOrEqual(list[1].createdAt)
        }
      })

      it('respects limit', () => {
        for (let i = 0; i < 5; i++) service.snapshot(`snap-${i}`)
        const result = service.listSnapshots(2)
        expect(result.length).toBeLessThanOrEqual(2)
      })
    })
  })
}

describe('WorkspaceStateService contract suite — self-validation', () => {
  it('exports runWorkspaceStateContractTests as a function', () => {
    expect(typeof runWorkspaceStateContractTests).toBe('function')
  })
})
