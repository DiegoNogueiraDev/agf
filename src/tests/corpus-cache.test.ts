/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.1 AC coverage: corpus-cache.ts
 *
 * AC1: cache hit (repo exists + fresh) → returns path without calling git pull
 * AC2: cache miss / clone failure → returns null without uncaught exception
 * AC3: expired entry → triggers git pull refresh, returns updated path
 * AC4: hasCorpusCache, listCorpusRepos coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── Mock child_process BEFORE imports ─────────────────────────────────────────

const mockExecSync = vi.hoisted(() => vi.fn())
const mockExecFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
  execFileSync: mockExecFileSync,
}))

// Import AFTER mocking so the module gets the mocked execSync
import {
  cloneOrPullCorpus,
  getRepoAge,
  hasCorpusCache,
  listCorpusRepos,
  acquireLock,
  releaseLock,
} from '../core/scaffolder/corpus-cache.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string

function makeFakeRepo(cacheDir: string, repo: string, ageMs = 0): string {
  const repoDir = join(cacheDir, repo)
  mkdirSync(join(repoDir, '.git'), { recursive: true })
  // Write a fake git log timestamp so getRepoAge returns a specific age
  const nowSec = Math.floor((Date.now() - ageMs) / 1000)
  // Mock execSync will provide the git log output; just create the .git dir
  return repoDir
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agf-corpus-cache-'))
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── AC1: cache hit (fresh repo) — no git pull called ──────────────────────────

describe('AC1: cache hit — fresh repo skips git pull', () => {
  it('returns the cached repo path when age is within TTL', () => {
    const repo = 'owner/my-repo'
    const repoDir = makeFakeRepo(tmpDir, repo)

    // execSync('git log -1 --format=%ct') returns recent timestamp (1 hour ago)
    const oneHourAgoSec = Math.floor((Date.now() - 3_600_000) / 1000)
    mockExecSync.mockReturnValueOnce(`${oneHourAgoSec}\n`)

    const result = cloneOrPullCorpus(repo, tmpDir)
    expect(result).toBe(repoDir)
  })

  it('does NOT call git pull when repo is within TTL', () => {
    const repo = 'owner/fresh-repo'
    makeFakeRepo(tmpDir, repo)

    const oneHourAgoSec = Math.floor((Date.now() - 3_600_000) / 1000)
    mockExecSync.mockReturnValueOnce(`${oneHourAgoSec}\n`)

    cloneOrPullCorpus(repo, tmpDir)

    // git pull uses execFileSync — verify it was not called
    const pullCalls = mockExecFileSync.mock.calls.filter(
      (c: unknown[]) => c[0] === 'git' && Array.isArray(c[1]) && (c[1] as string[]).includes('pull'),
    )
    expect(pullCalls).toHaveLength(0)
  })

  it('returns path even when lock already held by another process', () => {
    const repo = 'owner/locked-repo'
    const repoDir = makeFakeRepo(tmpDir, repo)

    // Write a fresh lock file to simulate another process holding the lock
    writeFileSync(join(repoDir, '.agf-lock'), String(Date.now()), 'utf-8')

    const result = cloneOrPullCorpus(repo, tmpDir)
    // Should return repoDir immediately (locked, skip pull)
    expect(result).toBe(repoDir)
    // execSync should NOT have been called (no git log, no pull)
    expect(mockExecSync).not.toHaveBeenCalled()
  })
})

// ── AC2: cache miss / clone failure → null, no uncaught exception ─────────────

describe('AC2: clone failure returns null gracefully', () => {
  it('returns null when git clone fails', () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('clone')) throw new Error('network unreachable')
    })

    const result = cloneOrPullCorpus('owner/new-repo', tmpDir)
    expect(result).toBeNull()
  })

  it('does not throw when clone fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('repository not found')
    })

    expect(() => cloneOrPullCorpus('owner/nonexistent', tmpDir)).not.toThrow()
  })

  it('returns the repo path (stale-but-usable) when git pull throws for existing repo', () => {
    const repo = 'owner/stale-repo'
    const repoDir = makeFakeRepo(tmpDir, repo)

    // getRepoAge: stale (25h ago) — uses execSync
    const stale = Math.floor((Date.now() - 25 * 3_600_000) / 1000)
    mockExecSync.mockReturnValueOnce(`${stale}\n`) // getRepoAge call
    // git pull throws — uses execFileSync
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('git pull failed')
    })

    const result = cloneOrPullCorpus(repo, tmpDir)
    // Returns stale path — better than null
    expect(result).toBe(repoDir)
  })
})

// ── AC3: expired entry → git pull called ─────────────────────────────────────

describe('AC3: expired TTL triggers git pull refresh', () => {
  it('calls git pull when repo age exceeds TTL (24h)', () => {
    const repo = 'owner/old-repo'
    makeFakeRepo(tmpDir, repo)

    // 25 hours old → exceeds DEFAULT_TTL_MS
    const stale = Math.floor((Date.now() - 25 * 3_600_000) / 1000)
    mockExecSync.mockReturnValueOnce(`${stale}\n`) // getRepoAge (execSync)
    mockExecFileSync.mockReturnValueOnce(undefined) // git pull (execFileSync)

    cloneOrPullCorpus(repo, tmpDir)

    // git pull now uses execFileSync('git', ['pull', '--ff-only'], ...)
    const pullCalls = mockExecFileSync.mock.calls.filter(
      (c: unknown[]) => c[0] === 'git' && Array.isArray(c[1]) && (c[1] as string[]).includes('pull'),
    )
    expect(pullCalls).toHaveLength(1)
  })

  it('still returns the repo path after successful git pull', () => {
    const repo = 'owner/stale-ok'
    const repoDir = makeFakeRepo(tmpDir, repo)

    const stale = Math.floor((Date.now() - 25 * 3_600_000) / 1000)
    mockExecSync.mockReturnValueOnce(`${stale}\n`) // getRepoAge
    mockExecFileSync.mockReturnValueOnce(undefined) // git pull

    const result = cloneOrPullCorpus(repo, tmpDir)
    expect(result).toBe(repoDir)
  })
})

// ── AC4: hasCorpusCache + listCorpusRepos ─────────────────────────────────────

describe('AC4: hasCorpusCache and listCorpusRepos', () => {
  it('hasCorpusCache returns false for uncached repo', () => {
    expect(hasCorpusCache('owner/uncached', tmpDir)).toBe(false)
  })

  it('hasCorpusCache returns true for a cached repo with .git dir', () => {
    makeFakeRepo(tmpDir, 'owner/cached')
    expect(hasCorpusCache('owner/cached', tmpDir)).toBe(true)
  })

  it('listCorpusRepos returns empty array when cache is empty', () => {
    mockExecSync.mockReturnValue('1000000\n') // getRepoAge — won't be called for empty dir
    const entries = listCorpusRepos(tmpDir)
    expect(entries).toEqual([])
  })

  it('listCorpusRepos returns entries for repos with .git', () => {
    makeFakeRepo(tmpDir, 'owner/repo-a')
    makeFakeRepo(tmpDir, 'owner/repo-b')

    // getRepoAge + getLastRefresh calls per repo (2 execSync per repo × 2 repos = 4)
    mockExecSync
      .mockReturnValueOnce(`${Math.floor(Date.now() / 1000)}\n`) // repo-a: getRepoAge
      .mockReturnValueOnce('2026-06-23T10:00:00Z\n') // repo-a: getLastRefresh
      .mockReturnValueOnce(`${Math.floor(Date.now() / 1000)}\n`) // repo-b: getRepoAge
      .mockReturnValueOnce('2026-06-23T11:00:00Z\n') // repo-b: getLastRefresh

    const entries = listCorpusRepos(tmpDir)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.repo).sort()).toEqual(['owner/repo-a', 'owner/repo-b'])
  })
})

// ── TOCTOU fix: acquireLock atomic O_EXCL (node_e5ac71840bcd) ────────────────

describe('acquireLock / releaseLock — TOCTOU fix (CWE-367)', () => {
  it('AC1: two sequential acquireLock on same dir → only first returns true', () => {
    const lockDir = mkdtempSync(join(tmpdir(), 'agf-lock-toctou-'))
    try {
      const r1 = acquireLock(lockDir)
      const r2 = acquireLock(lockDir) // lock already held
      expect(r1).toBe(true)
      expect(r2).toBe(false)
    } finally {
      rmSync(lockDir, { recursive: true, force: true })
    }
  })

  it('AC2: stale lock (>5min) is reclaimed and acquireLock returns true', () => {
    const lockDir = mkdtempSync(join(tmpdir(), 'agf-lock-stale-'))
    try {
      const lockFile = join(lockDir, '.agf-lock')
      // Write a timestamp 6 minutes in the past
      writeFileSync(lockFile, String(Date.now() - 6 * 60 * 1000), 'utf-8')
      const result = acquireLock(lockDir)
      expect(result).toBe(true)
    } finally {
      rmSync(lockDir, { recursive: true, force: true })
    }
  })

  it('AC3: releaseLock removes lockfile → subsequent acquireLock succeeds', () => {
    const lockDir = mkdtempSync(join(tmpdir(), 'agf-lock-release-'))
    try {
      expect(acquireLock(lockDir)).toBe(true)
      releaseLock(lockDir)
      expect(acquireLock(lockDir)).toBe(true)
    } finally {
      rmSync(lockDir, { recursive: true, force: true })
    }
  })
})

// ── getRepoAge — unit coverage ────────────────────────────────────────────────

describe('getRepoAge', () => {
  it('returns Infinity when git log fails (not a git repo)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo')
    })
    const age = getRepoAge('/nonexistent')
    expect(age).toBe(Infinity)
  })

  it('returns a numeric age in ms when git log succeeds', () => {
    const twoHoursAgoSec = Math.floor((Date.now() - 7_200_000) / 1000)
    mockExecSync.mockReturnValueOnce(`${twoHoursAgoSec}\n`)

    const age = getRepoAge('/some/repo')
    expect(typeof age).toBe('number')
    expect(age).toBeGreaterThan(7_000_000) // ~2h in ms
    expect(age).not.toBe(Infinity)
  })
})

// ── Security: CWE-78 command injection prevention (AC1 of task node_9a2125f6aec1) ─

describe('Security: malicious repo names rejected before any exec call (CWE-78)', () => {
  it('returns null for repo with shell metacharacter (semicolon)', () => {
    const result = cloneOrPullCorpus('evil; rm -rf /', '/tmp/agf-test')
    expect(result).toBeNull()
    expect(mockExecFileSync).not.toHaveBeenCalled()
    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('returns null for repo with backtick injection', () => {
    const result = cloneOrPullCorpus('owner/`whoami`', '/tmp/agf-test')
    expect(result).toBeNull()
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('returns null for repo with dollar-sign injection', () => {
    const result = cloneOrPullCorpus('owner/$(cat /etc/passwd)', '/tmp/agf-test')
    expect(result).toBeNull()
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('returns null for repo missing slash separator', () => {
    const result = cloneOrPullCorpus('notarepo', '/tmp/agf-test')
    expect(result).toBeNull()
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('accepts valid owner/name and calls execFileSync (not shell execSync) for clone', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'agf-sec-test-'))
    try {
      // Pre-create the repoDir so acquireLock can write its lockfile
      mkdirSync(join(cacheDir, 'facebook', 'react'), { recursive: true })
      mockExecFileSync.mockReturnValueOnce(undefined)
      cloneOrPullCorpus('facebook/react', cacheDir)
      // execFileSync should have been called with split args (no shell string)
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['clone', '--depth', '1']),
        expect.objectContaining({ stdio: 'pipe' }),
      )
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })
})
