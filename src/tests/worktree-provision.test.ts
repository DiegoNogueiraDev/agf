/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_9c0be6de554e — provisionamento worktree-por-formiga extraído para core
 * (fonte única reusada por `agf ant spawn` e `ant-swarming spawn`).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  provisionAntWorktree,
  listAntWorktrees,
  isSafeAntId,
  resolveRepoRoot,
  AntProvisionError,
} from '../core/swarm/worktree-provision.js'

function git(cwd: string, ...args: string[]): void {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  execFileSync('git', args, { cwd, stdio: 'ignore', env })
}

describe('worktree-provision', () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'agf-provision-'))
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.dev')
    git(repo, 'config', 'user.name', 'Test')
    execFileSync('git', ['commit', '--allow-empty', '-m', 'baseline'], {
      cwd: repo,
      stdio: 'ignore',
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    })
  })

  afterEach(() => {
    rmSync(`${repo}-ants`, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  })

  it('provisiona um worktree novo em branch ant/<id>', () => {
    const root = resolveRepoRoot(repo)!
    const wt = provisionAntWorktree(root, 'formiga-a')
    expect(wt.reused).toBe(false)
    expect(wt.branch).toBe('ant/formiga-a')
    expect(existsSync(wt.path)).toBe(true)
    expect(listAntWorktrees(root).map((a) => a.id)).toContain('formiga-a')
  })

  it('é idempotente: reprovisionar reusa o worktree vivo (mesmo path)', () => {
    const root = resolveRepoRoot(repo)!
    const first = provisionAntWorktree(root, 'formiga-b')
    const second = provisionAntWorktree(root, 'formiga-b')
    expect(second.reused).toBe(true)
    expect(second.path).toBe(first.path)
    expect(listAntWorktrees(root).filter((a) => a.id === 'formiga-b')).toHaveLength(1)
  })

  it('rejeita id com path traversal (typed error, nenhum worktree criado)', () => {
    const root = resolveRepoRoot(repo)!
    expect(isSafeAntId('../x')).toBe(false)
    let thrown: unknown
    try {
      provisionAntWorktree(root, '../x')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(AntProvisionError)
    expect((thrown as AntProvisionError).code).toBe('INVALID_ANT_ID')
    expect(listAntWorktrees(root)).toHaveLength(0)
  })
})
