/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract: WorkspaceStateService
 *
 * Core service interface for workspace state management — snapshots,
 * worktrees, diffs, and file tracking. Git-backed by default; the contract
 * is transport-agnostic and contains zero vendor imports.
 */

export interface Snapshot {
  id: string
  label: string
  createdAt: number
  fileCount: number
  /** SHA of the git commit backing this snapshot (implementation detail). */
  sha?: string
}

export interface DiffEntry {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
  additions: number
  deletions: number
}

export interface SnapshotDiff {
  fromId: string
  toId: string
  entries: DiffEntry[]
  totalAdditions: number
  totalDeletions: number
}

/**
 * Contract for workspace state management.
 *
 * Operations are git-backed but the contract does not expose git internals.
 * Implementations must work with temporary git repositories in tests and
 * real repositories in production. Zero vendor imports.
 */
export interface WorkspaceStateService {
  /**
   * Create a point-in-time snapshot of the current workspace.
   * The snapshot is backed by a git commit (implementation detail).
   *
   * @param label - Human-readable label for the snapshot.
   * @returns The created snapshot metadata.
   */
  snapshot(label: string): Snapshot

  /**
   * Compute a diff between two snapshots.
   *
   * @param fromId - The earlier snapshot ID.
   * @param toId - The later snapshot ID. Defaults to current workspace state.
   * @returns The diff, or `null` if either snapshot is not found.
   */
  diff(fromId: string, toId?: string): SnapshotDiff | null

  /**
   * Restore the workspace to a previous snapshot.
   * This is a destructive operation — it replaces the current state.
   *
   * @param snapshotId - The snapshot to restore to.
   * @returns `true` if restored successfully, `false` if not found.
   */
  restore(snapshotId: string): boolean

  /**
   * Revert to the state before a specific snapshot.
   * Equivalent to `git revert` — creates a new commit that undoes the
   * changes introduced by the snapshot.
   *
   * @param snapshotId - The snapshot to revert.
   * @returns The new snapshot ID post-revert, or `null` on failure.
   */
  revert(snapshotId: string): Snapshot | null

  /**
   * Register a file path for tracking. Tracked files are included in
   * snapshots. Untracked files are ignored.
   *
   * @param path - Relative path from workspace root.
   */
  track(path: string): void

  /**
   * List all snapshots ordered by creation time descending.
   *
   * @param limit - Maximum snapshots to return (default: 20).
   * @returns The snapshots.
   */
  listSnapshots(limit?: number): Snapshot[]
}
