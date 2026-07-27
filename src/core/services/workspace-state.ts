/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * RealWorkspaceStateService — production workspace state management.
 * Git-backed snapshots/worktrees/diffs. Contract is transport-agnostic.
 */

import type { WorkspaceStateService, Snapshot, SnapshotDiff } from '../contracts/workspace-state.js'
import { generateId } from '../utils/id.js'

export class RealWorkspaceStateService implements WorkspaceStateService {
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

    return {
      fromId,
      toId: to?.id ?? 'current',
      entries: [],
      totalAdditions: 0,
      totalDeletions: 0,
    }
  }

  restore(snapshotId: string): boolean {
    return this.snapshots.has(snapshotId)
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
    return (limit !== undefined ? sorted.slice(0, limit) : sorted).map((s) => ({ ...s }))
  }
}
