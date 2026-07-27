/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { antCommand } from '../cli/commands/ant-cmd.js'

// node_d95f65a50dbf — worktree-por-formiga: `agf ant spawn <id>` provisiona um
// git worktree em <repo>-ants/<id> (branch ant/<id> a partir do HEAD) e devolve
// os exports prontos (AGF_AGENT_ID + AGF_GRAPH_ROOT=repo raiz) para a formiga
// operar isolada mas no MESMO grafo da colônia (épico node_5581f7a45f3a).

interface Envelope {
  ok: boolean
  code?: string
  data?: {
    path?: string
    branch?: string
    exports?: Record<string, string>
    ants?: Array<{ id: string; path: string; branch?: string }>
    removed?: boolean
  }
}

function git(cwd: string, ...args: string[]): void {
  // Sob lint-staged/hook, GIT_DIR/GIT_INDEX_FILE herdados apontariam pro repo pai.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  execFileSync('git', args, { cwd, stdio: 'ignore', env })
}

describe('agf ant — provisão de worktree por formiga', () => {
  let repo: string

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'agf-ant-repo-')))
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.dev')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'README.md'), '# repo da colônia\n')
    git(repo, 'add', 'README.md')
    git(repo, 'commit', '-m', 'chore: init')
  })

  afterEach(() => {
    rmSync(`${repo}-ants`, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function runAnt(args: string[]): Promise<Envelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await antCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    const lines = out
      .join('')
      .trim()
      .split('\n')
      .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
    return JSON.parse(lines[lines.length - 1]) as Envelope
  }

  it('AC1: spawn cria o worktree em <repo>-ants/<id> e devolve os exports da formiga', async () => {
    const env = await runAnt(['spawn', 'formiga-x', '-d', repo])

    expect(env.ok).toBe(true)
    const wtPath = join(`${repo}-ants`, 'formiga-x')
    expect(env.data?.path).toBe(wtPath)
    expect(existsSync(join(wtPath, 'README.md'))).toBe(true)
    expect(env.data?.exports?.AGF_AGENT_ID).toBe('formiga-x')
    expect(env.data?.exports?.AGF_GRAPH_ROOT).toBe(repo)
    expect(env.data?.branch).toBe('ant/formiga-x')
  })

  it('AC2: list enumera a formiga; rm remove o worktree do disco', async () => {
    await runAnt(['spawn', 'formiga-x', '-d', repo])

    const listed = await runAnt(['list', '-d', repo])
    expect(listed.ok).toBe(true)
    expect(listed.data?.ants?.map((a) => a.id)).toContain('formiga-x')

    const removed = await runAnt(['rm', 'formiga-x', '-d', repo])
    expect(removed.ok).toBe(true)
    expect(existsSync(join(`${repo}-ants`, 'formiga-x'))).toBe(false)
  })

  it('AC3: dir sem repo git ⇒ ok:false com código claro e nada no disco', async () => {
    const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'agf-ant-notrepo-')))

    const env = await runAnt(['spawn', 'formiga-x', '-d', notRepo])

    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_A_GIT_REPO')
    expect(existsSync(`${notRepo}-ants`)).toBe(false)
    rmSync(notRepo, { recursive: true, force: true })
  })

  it('spawn duas vezes do mesmo id é idempotente (reusa o worktree vivo)', async () => {
    const first = await runAnt(['spawn', 'formiga-x', '-d', repo])
    const second = await runAnt(['spawn', 'formiga-x', '-d', repo])

    expect(second.ok).toBe(true)
    expect(second.data?.path).toBe(first.data?.path)
  })

  it('spawn symlinka node_modules do repo raiz (deps gitignored não viajam no worktree)', async () => {
    const { mkdirSync, lstatSync } = await import('node:fs')
    mkdirSync(join(repo, 'node_modules'), { recursive: true })
    writeFileSync(join(repo, 'node_modules', 'marker.txt'), 'deps')

    const env = await runAnt(['spawn', 'formiga-x', '-d', repo])

    expect(env.ok).toBe(true)
    const linked = join(`${repo}-ants`, 'formiga-x', 'node_modules')
    expect(lstatSync(linked).isSymbolicLink()).toBe(true)
    expect(existsSync(join(linked, 'marker.txt'))).toBe(true)
  })

  it('rm desfaz o symlink de node_modules que o próprio spawn criou (sem exigir --force)', async () => {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(repo, 'node_modules'), { recursive: true })
    writeFileSync(join(repo, 'node_modules', 'marker.txt'), 'deps')
    await runAnt(['spawn', 'formiga-x', '-d', repo])

    const removed = await runAnt(['rm', 'formiga-x', '-d', repo])

    expect(removed.ok).toBe(true)
    expect(existsSync(join(`${repo}-ants`, 'formiga-x'))).toBe(false)
    expect(existsSync(join(repo, 'node_modules', 'marker.txt'))).toBe(true) // alvo do link intacto
  })

  it('id inválido (path traversal) é recusado', async () => {
    const env = await runAnt(['spawn', '../evil', '-d', repo])

    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_ANT_ID')
  })
})
