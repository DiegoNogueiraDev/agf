/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * FakeWorkspaceStateService — in-memory, deterministic fake for testing.
 * Implements WorkspaceStateService contract. Never touches real git or MCP.
 */

import type { WorkspaceStateService, Snapshot, SnapshotDiff, DiffEntry } from '../../core/contracts/workspace-state.js'
import { generateId } from '../../core/utils/id.js'

export class FakeWorkspaceStateService implements WorkspaceStateService {
  private snapshots: Map<string, Snapshot> = new Map()
  private trackedFiles: Set<string> = new Set()

  snapshot(label: string): Snapshot {
    const snap: Snapshot = {
      id: 'snap_' + generateId('ws'),
      label,
      createdAt: Date.now(),
      fileCount: this.trackedFiles.size,
    }
    this.snapshots.set(snap.id, snap)
    return { ...snap }
  }

  diff(fromId: string, toId?: string): SnapshotDiff | null {
    const from = this.snapshots.get(fromId)
    if (!from) return null

    const to = toId ? this.snapshots.get(toId) : null
    const targetId = to?.id ?? 'current'

    // Deterministic fake diff: return empty diff
    return {
      fromId,
      toId: targetId,
      entries: [],
      totalAdditions: 0,
      totalDeletions: 0,
    }
  }

  restore(snapshotId: string): boolean {
    const snap = this.snapshots.get(snapshotId)
    if (!snap) return false
    return true
  }

  revert(snapshotId: string): Snapshot | null {
    const snap = this.snapshots.get(snapshotId)
    if (!snap) return null
    const reversed: Snapshot = {
      id: 'snap_revert_' + generateId('ws'),
      label: `revert-${snap.label}`,
      createdAt: Date.now(),
      fileCount: snap.fileCount,
    }
    this.snapshots.set(reversed.id, reversed)
    return { ...reversed }
  }

  track(path: string): void {
    this.trackedFiles.add(path)
  }

  listSnapshots(limit?: number): Snapshot[] {
    const sorted = [...this.snapshots.values()].sort((a, b) => b.createdAt - a.createdAt)
    const sliced = limit !== undefined ? sorted.slice(0, limit) : sorted
    return sliced.map((s) => ({ ...s }))
  }
}
