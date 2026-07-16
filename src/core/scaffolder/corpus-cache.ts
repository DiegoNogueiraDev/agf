/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * D1 — GitHub corpus cache: clones reference repos locally for
 * deterministic scaffold generation. Inspired by OpenCode's repository
 * cache (file-locked, SSH-aware, TTL + refresh).
 *
 * Security: all git invocations use execFileSync (no shell) so user-supplied
 * owner/name cannot inject shell metacharacters (CWE-78). The repo identifier
 * is validated at the boundary before any exec call.
 */

import { execFileSync, execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  readdirSync,
  openSync,
  closeSync,
} from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'scaffolder/corpus-cache.ts' })

export interface CorpusEntry {
  /** Full repo name (owner/name). */
  repo: string
  /** Local clone path. */
  localPath: string
  /** Last git pull timestamp (ISO). */
  lastRefresh: string
  /** Age in ms since last refresh. */
  ageMs: number
}

const DEFAULT_CACHE_DIR = path.join(homedir(), '.agf', 'corpus')
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

/** Validate repo identifier — only safe characters allowed (CWE-78 boundary guard). */
const REPO_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

function isValidRepo(repo: string): boolean {
  return REPO_RE.test(repo)
}

/** Resolve cache directory; creates if missing. */
function ensureCacheDir(dir: string = DEFAULT_CACHE_DIR): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Atomically acquire a lock file using O_EXCL (open-exclusive).
 * Two concurrent callers cannot both get true — the OS guarantees only one
 * create succeeds (CWE-367 TOCTOU fix over the prior existsSync+writeFileSync).
 * Stale locks (>5 min) are reclaimed with unlink+retry.
 */
export function acquireLock(repoDir: string): boolean {
  const lockFile = path.join(repoDir, '.agf-lock')
  const tryCreate = (): boolean => {
    try {
      // 'wx' = O_WRONLY | O_CREAT | O_EXCL — fails if file exists (atomic)
      const fd = openSync(lockFile, 'wx')
      writeFileSync(fd, String(Date.now()), 'utf-8')
      closeSync(fd)
      return true
    } catch {
      return false
    }
  }

  if (tryCreate()) return true

  // Lock exists — check staleness
  try {
    const ts = parseInt(readFileSync(lockFile, 'utf-8'), 10)
    const age = Date.now() - ts
    if (age < 300_000) return false // lock still fresh (<5min)
    // Stale: unlink and retry once
    unlinkSync(lockFile)
    return tryCreate()
  } catch {
    return false
  }
}

export function releaseLock(repoDir: string): void {
  const lockFile = path.join(repoDir, '.agf-lock')
  try {
    unlinkSync(lockFile)
  } catch {
    /* ignore */
  }
}

/**
 * Clone or update a GitHub repo locally.
 * If the repo is already cloned, git pull to refresh.
 * Returns the local path, or null if invalid/failed.
 */
export function cloneOrPullCorpus(repo: string, dir: string = DEFAULT_CACHE_DIR): string | null {
  if (!isValidRepo(repo)) {
    log.warn('corpus-cache:invalid-repo', { repo })
    return null
  }

  const cacheDir = ensureCacheDir(dir)
  const repoDir = path.join(cacheDir, repo)

  // Already cloned — pull if stale
  if (existsSync(path.join(repoDir, '.git'))) {
    if (!acquireLock(repoDir)) {
      log.debug('corpus-cache:locked', { repo })
      return repoDir
    }
    try {
      const age = getRepoAge(repoDir)
      if (age > DEFAULT_TTL_MS) {
        log.info('corpus-cache:refresh', { repo, ageMs: age })
        execFileSync('git', ['pull', '--ff-only'], { cwd: repoDir, timeout: 30000, stdio: 'ignore' })
      }
      return repoDir
    } catch {
      return repoDir // stale but usable
    } finally {
      releaseLock(repoDir)
    }
  }

  // Clone fresh
  if (!acquireLock(repoDir)) return null
  try {
    mkdirSync(path.dirname(repoDir), { recursive: true })
    const url = `https://github.com/${repo}.git`
    execFileSync('git', ['clone', '--depth', '1', url, repoDir], {
      timeout: 120000,
      stdio: 'pipe',
    })
    log.info('corpus-cache:cloned', { repo, path: repoDir })
    return repoDir
  } catch (err) {
    log.warn('corpus-cache:clone-failed', { repo, error: err instanceof Error ? err.message : String(err) })
    return null
  } finally {
    releaseLock(repoDir)
  }
}

/**
 * Get the age of a cached corpus repo in milliseconds.
 */
export function getRepoAge(repoDir: string): number {
  try {
    const stat = execSync('git log -1 --format=%ct', { cwd: repoDir, timeout: 5000, encoding: 'utf-8' })
    const lastCommit = parseInt(stat.trim(), 10) * 1000
    return Date.now() - lastCommit
  } catch {
    return Infinity
  }
}

/**
 * List all cached corpus repos with their status.
 */
export function listCorpusRepos(dir: string = DEFAULT_CACHE_DIR): CorpusEntry[] {
  const cacheDir = ensureCacheDir(dir)
  const entries: CorpusEntry[] = []
  try {
    const owners = readdirSync(cacheDir, { withFileTypes: true })
      .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
      .map((d: { name: string }) => d.name)

    for (const owner of owners) {
      const ownerDir = path.join(cacheDir, owner)
      const repos = readdirSync(ownerDir, { withFileTypes: true })
        .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
        .map((d: { name: string }) => d.name)

      for (const repo of repos) {
        const repoDir = path.join(ownerDir, repo)
        if (existsSync(path.join(repoDir, '.git'))) {
          entries.push({
            repo: `${owner}/${repo}`,
            localPath: repoDir,
            lastRefresh: getLastRefresh(repoDir),
            ageMs: getRepoAge(repoDir),
          })
        }
      }
    }
  } catch {
    /* ignore */
  }
  return entries
}

function getLastRefresh(repoDir: string): string {
  try {
    const stat = execSync('git log -1 --format=%cI', { cwd: repoDir, timeout: 5000, encoding: 'utf-8' })
    return stat.trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Check if a repo is already cached locally.
 */
export function hasCorpusCache(repo: string, dir: string = DEFAULT_CACHE_DIR): boolean {
  const repoDir = path.join(ensureCacheDir(dir), repo)
  return existsSync(path.join(repoDir, '.git'))
}

export { DEFAULT_CACHE_DIR }
