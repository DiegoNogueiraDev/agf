/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_9c0be6de554e — `ant-swarming spawn`: N formigas = N worktrees + registro
 * na sessão swarm. Fixture: repo git temporário + banco em memória.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { runSpawn } from '../swarming/spawn.js'
import { SwarmCoordinator } from '../core/swarm/swarm-coordinator.js'
import { AntProvisionError } from '../core/swarm/worktree-provision.js'
import { runMigrations } from '../core/store/migrations/index.js'

function git(cwd: string, ...args: string[]): void {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  execFileSync('git', args, { cwd, stdio: 'ignore', env })
}

describe('ant-swarming spawn', () => {
  let repo: string
  let db: Database.Database

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'agf-swarm-spawn-'))
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.dev')
    git(repo, 'config', 'user.name', 'Test')
    execFileSync('git', ['commit', '--allow-empty', '-m', 'baseline'], {
      cwd: repo,
      stdio: 'ignore',
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    })
    db = new Database(':memory:')
    runMigrations(db)
  })

  afterEach(() => {
    db.close()
    rmSync(`${repo}-ants`, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  })

  it('AC1: spawn --ants 2 cria 2 worktrees em branches distintas + 2 agentes na sessão', () => {
    const result = runSpawn({ db, dir: repo, ants: 2 })
    expect(result.ants).toHaveLength(2)
    const branches = result.ants.map((a) => a.branch)
    expect(new Set(branches).size).toBe(2)
    expect(branches).toEqual(['ant/ant-1', 'ant/ant-2'])
    for (const ant of result.ants) expect(existsSync(ant.path)).toBe(true)
    // count=2 no coordinator (fonte de verdade dos agentes registrados)
    expect(result.count).toBe(2)
    expect(new SwarmCoordinator(db).agentCount(result.sessionId)).toBe(2)
  })

  it('AC2: idempotente — re-spawn reusa os worktrees vivos (mesmos paths, zero órfãos)', () => {
    const first = runSpawn({ db, dir: repo, ants: 2 })
    const second = runSpawn({ db, dir: repo, ants: 2 })
    expect(second.ants.every((a) => a.reused)).toBe(true)
    expect(second.ants.map((a) => a.path).sort()).toEqual(first.ants.map((a) => a.path).sort())
  })

  it('AC3: base id com path traversal → AntProvisionError, nenhum worktree criado', () => {
    let thrown: unknown
    try {
      runSpawn({ db, dir: repo, ants: 2, baseId: '../x' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(AntProvisionError)
    expect((thrown as AntProvisionError).code).toBe('INVALID_ANT_ID')
    expect(existsSync(`${repo}-ants`)).toBe(false)
  })
})
