/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 *
 *
 * Commercial licenses and support — see COMMERCIAL.md.
 */

/**
 * Shadow Branch — Git Transactional Layer (GTL)
 *
 * Each agent task runs in an **isolated git worktree** at
 * `${tmpdir}/mcpg-wt-{nodeId}-{ts}` with a dedicated branch
 * `ai-shadow/{nodeId}-{ts}`. Worktrees are atomic: removing one leaves no
 * trace in the main repo's working tree or branch list.
 *
 * Lifecycle:
 *   - BEGIN     `git worktree add -b ai-shadow/X /tmp/mcpg-wt-X HEAD`
 *   - EXECUTE   agent works inside the worktree (its own cwd, own branch)
 *   - COMMIT    `git merge --ff-only` then `git worktree remove + branch -D`
 *   - ROLLBACK  `git worktree remove --force + branch -D`
 *   - GC        `git worktree prune` cleans worktree metadata for dirs that
 *               were rm-rf'd outside git's knowledge (e.g. crashes)
 *
 * Security: all git invocations use execFileSync (no shell) so
 * branch names and worktree paths cannot inject shell metacharacters (CWE-78).
 * Input is validated at the boundary before any exec call.
 */

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { statfsSync } from 'node:fs'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'shadow-branch.ts' })

// ── Types ───────────────────────────────────────────────

export interface ShadowBranchHandle {
  branchName: string
  /** Absolute path to the worktree directory; absent in legacy fallback mode. */
  worktreePath?: string
}

export interface ShadowBranchResult extends ShadowBranchHandle {
  created: boolean
  error?: string
}

export interface MergeResult {
  merged: boolean
  branchName: string
  worktreePath?: string
  error?: string
}

export interface DiscardResult {
  discarded: boolean
  branchName: string
  worktreePath?: string
  error?: string
}

export interface PruneResult {
  pruned: boolean
  reapedBranches: number
  reapedWorktrees: number
  output?: string
  error?: string
}

export interface PruneOptions {
  cwd?: string
  /** Branches whose encoded timestamp is older than this are reaped. Default: 1h. */
  ttlMs?: number
}

/** Accepts either the legacy string form or a `{branchName, worktreePath?}` handle. */
export type ShadowBranchInput = string | ShadowBranchHandle

// ── Boundary validation (CWE-78) ────────────────────────

/** nodeId must be alphanumeric + hyphens/underscores only. */
const NODE_ID_RE = /^[a-zA-Z0-9_-]+$/

/**
 * Branch names: allow alphanumeric, hyphens, underscores, forward slashes, dots.
 * Rejects shell metacharacters that could escape the arg list.
 */
const BRANCH_RE = /^[a-zA-Z0-9_./-]+$/

/**
 * Validate a nodeId before using it in branch names.
 * Returns false for empty or metacharacter-containing strings.
 */
function isValidNodeId(id: string): boolean {
  return id.length > 0 && NODE_ID_RE.test(id)
}

/**
 * Validate a branch name or git ref before passing it as an arg.
 */
function isValidBranchName(name: string): boolean {
  return name.length > 0 && BRANCH_RE.test(name)
}

// ── Helpers ─────────────────────────────────────────────

function toHandle(input: ShadowBranchInput): ShadowBranchHandle {
  return typeof input === 'string' ? { branchName: input } : input
}

function getWorktreePath(nodeId: string): string {
  return join(tmpdir(), `mcpg-wt-${nodeId}-${Date.now()}`)
}

function git(args: string[], opts: { cwd: string; timeout: number }): string {
  return execFileSync('git', args, { ...opts, encoding: 'utf-8' }).toString()
}

// ── Public API ──────────────────────────────────────────

/** Generate a deterministic shadow branch name from a node ID. */
export function getShadowBranchName(nodeId: string): string {
  if (!nodeId) return `ai-shadow/unknown-${Date.now()}`
  return `ai-shadow/${nodeId}-${Date.now()}`
}

/**
 * Create a shadow branch in an isolated worktree. Returns a handle the
 * caller passes back to merge/discard so the worktree path is preserved.
 *
 * Uses `git worktree add -b ai-shadow/X /tmp/mcpg-wt-X HEAD` so the
 * branch lives in `refs/heads/` (visible to `git branch`) but the
 * working tree is a separate directory — running agent's cwd is never
 * switched.
 */
export function createShadowBranch(nodeId: string, cwd?: string): ShadowBranchResult {
  if (!nodeId) return { branchName: '', created: false, error: 'nodeId is required' }
  if (!isValidNodeId(nodeId)) {
    log.warn('shadow-branch:invalid-node-id', { nodeId })
    return { branchName: '', created: false, error: 'nodeId contains invalid characters' }
  }
  const branchName = getShadowBranchName(nodeId)
  const worktreePath = getWorktreePath(nodeId)
  const opts = { cwd: cwd ?? process?.cwd() ?? '.', timeout: 10000 }

  // Guard A: disk pressure — refuse when < 500 MB free in the tmp dir
  try {
    const stats = statfsSync(tmpdir())
    const freeBytes = stats.bavail * stats.bsize
    if (freeBytes < 500 * 1024 * 1024) {
      log.warn('shadow-branch:create-skipped:disk-pressure', { nodeId, freeBytes })
      return { branchName, worktreePath, created: false, error: 'disk_pressure' }
    }
  } catch (e) {
    log.debug('shadow-branch:disk-check-unsupported', { error: String(e) })
  }

  // Guards B + C: soft cap per nodeId (>= 3) + hard cap global (>= 50)
  try {
    const gcOpts = { cwd: cwd ?? process?.cwd() ?? '.', timeout: 5000 }
    const allBranches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/ai-shadow'], gcOpts)
      .trim()
      .split('\n')
      .filter(Boolean)

    // Soft cap: same nodeId has >= 3 shadow branches → reap before creating another
    const nodePrefix = `ai-shadow/${nodeId}-`
    const existingForNode = allBranches.filter((b) => b.startsWith(nodePrefix))
    if (existingForNode.length >= 3) {
      reapShadowForNode(nodeId, cwd)
      log.info('shadow-branch:soft-cap-reap', { nodeId, reaped: existingForNode.length })
    }

    // Hard cap: total >= 50 → emergency GC with 30 min TTL
    if (allBranches.length >= 50) {
      log.warn('shadow-branch:hard-cap-gc', { total: allBranches.length })
      pruneOrphanWorktrees({ cwd, ttlMs: 30 * 60 * 1000 })
    }
  } catch (e) {
    log.debug('shadow-branch:cap-guards-skipped', { error: String(e) })
  }

  try {
    git(['worktree', 'add', '-b', branchName, worktreePath, 'HEAD'], opts)
    log.info('shadow-branch:created', { nodeId, branchName, worktreePath })
    return { branchName, worktreePath, created: true }
  } catch (err) {
    const error = String(err)
    log.warn('shadow-branch:create-failed', { nodeId, error })
    return { branchName, worktreePath, created: false, error }
  }
}

/**
 * Merge a shadow branch back to `targetBranch` (fast-forward only) and
 * remove its worktree. Accepts either the legacy string form or the
 * full handle from `createShadowBranch`.
 *
 * Operates on the main repo's `cwd` — never inside the worktree itself
 * (we'd be removing the floor we're standing on).
 */
export function mergeShadowBranch(branchOrHandle: ShadowBranchInput, targetBranch: string, cwd?: string): MergeResult {
  const handle = toHandle(branchOrHandle)
  if (!handle.branchName) return { merged: false, branchName: '', error: 'branchName is required' }
  if (!targetBranch) return { merged: false, branchName: handle.branchName, error: 'targetBranch is required' }
  if (!isValidBranchName(handle.branchName)) {
    return { merged: false, branchName: handle.branchName, error: 'branchName contains invalid characters' }
  }
  if (targetBranch !== 'HEAD' && !isValidBranchName(targetBranch)) {
    return { merged: false, branchName: handle.branchName, error: 'targetBranch contains invalid characters' }
  }
  const opts = { cwd: cwd ?? process?.cwd() ?? '.', timeout: 30000 }

  try {
    if (targetBranch !== 'HEAD') {
      git(['checkout', targetBranch], opts)
    }
    git(['merge', handle.branchName, '--ff-only'], opts)
    if (handle.worktreePath) {
      try {
        git(['worktree', 'remove', handle.worktreePath], opts)
      } catch (wtErr) {
        log.debug('shadow-branch:worktree-remove-soft-fail', {
          worktreePath: handle.worktreePath,
          reason: String(wtErr),
        })
      }
    }
    git(['branch', '-D', handle.branchName], opts)

    log.info('shadow-branch:merged', {
      branchName: handle.branchName,
      worktreePath: handle.worktreePath,
      targetBranch,
    })
    return { merged: true, branchName: handle.branchName, worktreePath: handle.worktreePath }
  } catch (err) {
    const error = String(err)
    log.warn('shadow-branch:merge-failed', { branchName: handle.branchName, targetBranch, error })
    return { merged: false, branchName: handle.branchName, worktreePath: handle.worktreePath, error }
  }
}

/**
 * Discard a shadow branch (rollback). Removes the worktree atomically
 * with `--force` so any uncommitted work inside it is dropped, then
 * deletes the branch.
 */
export function discardShadowBranch(
  branchOrHandle: ShadowBranchInput,
  targetBranch: string,
  cwd?: string,
): DiscardResult {
  const handle = toHandle(branchOrHandle)
  if (!handle.branchName) return { discarded: false, branchName: '', error: 'branchName is required' }
  if (!targetBranch) return { discarded: false, branchName: handle.branchName, error: 'targetBranch is required' }
  if (!isValidBranchName(handle.branchName)) {
    return { discarded: false, branchName: handle.branchName, error: 'branchName contains invalid characters' }
  }
  if (targetBranch !== 'HEAD' && !isValidBranchName(targetBranch)) {
    return { discarded: false, branchName: handle.branchName, error: 'targetBranch contains invalid characters' }
  }
  const opts = { cwd: cwd ?? process?.cwd() ?? '.', timeout: 10000 }

  try {
    if (handle.worktreePath) {
      try {
        git(['worktree', 'remove', '--force', '--force', handle.worktreePath], opts)
      } catch (wtErr) {
        log.debug('shadow-branch:worktree-remove-soft-fail', {
          worktreePath: handle.worktreePath,
          reason: String(wtErr),
        })
      }
    } else if (targetBranch !== 'HEAD') {
      git(['checkout', targetBranch], opts)
    }
    git(['branch', '-D', handle.branchName], opts)

    log.info('shadow-branch:discarded', {
      branchName: handle.branchName,
      worktreePath: handle.worktreePath,
      targetBranch,
    })
    return { discarded: true, branchName: handle.branchName, worktreePath: handle.worktreePath }
  } catch (err) {
    const error = String(err)
    log.warn('shadow-branch:discard-failed', { branchName: handle.branchName, error })
    return { discarded: false, branchName: handle.branchName, worktreePath: handle.worktreePath, error }
  }
}

/** Extract the trailing `-<digits>` timestamp the branch-name builder embeds. */
function parseShadowTimestamp(branchName: string): number | null {
  const match = /-(\d{10,})$/.exec(branchName)
  if (!match) return null
  const ts = Number(match[1])
  return Number.isFinite(ts) && ts > 0 ? ts : null
}

/** Map ai-shadow branch → its registered worktree path, parsed from `git worktree list --porcelain`. */
function listShadowWorktrees(execOpts: { cwd: string; timeout: number }): Map<string, string> {
  const map = new Map<string, string>()
  let raw: string
  try {
    raw = git(['worktree', 'list', '--porcelain'], execOpts)
  } catch {
    return map // best-effort
  }
  let currentPath = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim()
    } else if (line.startsWith('branch refs/heads/ai-shadow/')) {
      const branch = line.slice('branch refs/heads/'.length).trim()
      if (currentPath) map.set(branch, currentPath)
    }
  }
  return map
}

/**
 * Best-effort GC — reaps shadow branches and worktrees whose embedded
 * timestamp is older than `ttlMs` (default 1h), then runs
 * `git worktree prune` to reclaim metadata for dirs removed outside
 * git's knowledge. Never throws — every step is silent-fail.
 */
export function pruneOrphanWorktrees(options?: PruneOptions): PruneResult {
  const cwd = options?.cwd ?? process?.cwd() ?? '.'
  const envTtl = Number(process.env.MCP_GRAPH_SHADOW_TTL_MS ?? '')
  const ttlMs = options?.ttlMs ?? (Number.isFinite(envTtl) && envTtl > 0 ? envTtl : 60 * 60 * 1000)
  const execOpts = { cwd, timeout: 10000 }
  const cutoff = Date.now() - ttlMs
  let reapedBranches = 0
  let reapedWorktrees = 0

  let branches: string[] = []
  try {
    const out = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/ai-shadow'], execOpts)
    branches = out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch (err) {
    log.debug('shadow-branch:prune:list-failed', { error: String(err) })
  }

  const wtMap = branches.length > 0 ? listShadowWorktrees(execOpts) : new Map<string, string>()
  for (const branch of branches) {
    const ts = parseShadowTimestamp(branch)
    if (ts === null || ts >= cutoff) continue
    const wtPath = wtMap.get(branch)
    if (wtPath) {
      try {
        git(['worktree', 'remove', '--force', '--force', wtPath], execOpts)
        reapedWorktrees += 1
      } catch (err) {
        log.debug('shadow-branch:prune:wt-remove-failed', { branch, wtPath, error: String(err) })
      }
    }
    try {
      git(['branch', '-D', branch], execOpts)
      reapedBranches += 1
    } catch (err) {
      log.debug('shadow-branch:prune:branch-delete-failed', { branch, error: String(err) })
    }
  }

  try {
    const output = git(['worktree', 'prune', '--verbose'], execOpts)
    if (reapedBranches > 0 || reapedWorktrees > 0) {
      log.info('shadow-branch:prune-ok', { reapedBranches, reapedWorktrees, ttlMs })
    } else {
      log.debug('shadow-branch:prune-ok', { reapedBranches, reapedWorktrees, output })
    }
    return { pruned: true, reapedBranches, reapedWorktrees, output }
  } catch (err) {
    const error = String(err)
    log.debug('shadow-branch:prune-failed', { error })
    return { pruned: false, reapedBranches, reapedWorktrees, error }
  }
}

/**
 * Reap any shadow worktrees + branches whose name starts with
 * `ai-shadow/${nodeId}-`. Idempotent; never throws.
 */
export function reapShadowForNode(nodeId: string, cwd?: string): PruneResult {
  if (!nodeId) {
    return { pruned: true, reapedBranches: 0, reapedWorktrees: 0 }
  }
  const execOpts = { cwd: cwd ?? process?.cwd() ?? '.', timeout: 10000 }
  const prefix = `ai-shadow/${nodeId}-`
  const wtMap = listShadowWorktrees(execOpts)
  let reapedBranches = 0
  let reapedWorktrees = 0

  for (const [branch, wtPath] of wtMap) {
    if (!branch.startsWith(prefix)) continue
    try {
      git(['worktree', 'remove', '--force', '--force', wtPath], execOpts)
      reapedWorktrees += 1
    } catch (err) {
      log.debug('shadow-branch:reap:wt-remove-failed', { branch, wtPath, error: String(err) })
    }
    try {
      git(['branch', '-D', branch], execOpts)
      reapedBranches += 1
    } catch (err) {
      log.debug('shadow-branch:reap:branch-delete-failed', { branch, error: String(err) })
    }
  }

  if (reapedBranches > 0 || reapedWorktrees > 0) {
    log.info('shadow-branch:reap-ok', { nodeId, reapedBranches, reapedWorktrees })
  }
  return { pruned: true, reapedBranches, reapedWorktrees }
}
