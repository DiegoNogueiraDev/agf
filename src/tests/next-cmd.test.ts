/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/next-cmd.ts — nextCommand factory wiring.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextCommand } from '../cli/commands/next-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

vi.mock('../core/planner/validation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../core/planner/validation.js')>()
  return { ...orig, validateNextTaskInput: vi.fn(orig.validateNextTaskInput) }
})

describe('nextCommand', () => {
  it('builds the "next" command with a description', () => {
    const cmd = nextCommand()
    expect(cmd.name()).toBe('next')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = nextCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})

describe('nextCommand — AGF_AGENT_ID env fallback (node_wire_7d739490fe72 — resolve-agent-id wire)', () => {
  let dir: string
  const originalEnv = process.env.AGF_AGENT_ID

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.AGF_AGENT_ID
    else process.env.AGF_AGENT_ID = originalEnv
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await nextCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function seedTask(store: SqliteStore, id: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'backlog',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }

  it('AGF_AGENT_ID env var alone (no --agent flag) triggers the atomic claim path', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-envagent-'))
    const store = SqliteStore.open(dir)
    store.initProject('next-envagent-test')
    seedTask(store, 't1')
    store.close()

    process.env.AGF_AGENT_ID = 'env-agent-42'
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { claim?: { agentId: string } }
    expect(data.claim?.agentId).toBe('env-agent-42')
  })

  it('an explicit --agent flag still takes priority over AGF_AGENT_ID', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-flagpriority-'))
    const store = SqliteStore.open(dir)
    store.initProject('next-flagpriority-test')
    seedTask(store, 't1')
    store.close()

    process.env.AGF_AGENT_ID = 'env-agent-should-not-win'
    const result = await run(['-d', dir, '--agent', 'flag-agent'])
    expect(result.ok).toBe(true)
    expect((result.data as { claim?: { agentId: string } }).claim?.agentId).toBe('flag-agent')
  })

  it('without --agent or AGF_AGENT_ID, the claim path is skipped (default behavior unchanged)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-noagent-'))
    const store = SqliteStore.open(dir)
    store.initProject('next-noagent-test')
    seedTask(store, 't1')
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { claim?: unknown }).claim).toBeUndefined()
  })
})

describe('nextCommand — anti-hijack por dono (claimedBy) (node_bfd8fa7d664d)', () => {
  let dir: string
  const originalEnv = process.env.AGF_AGENT_ID

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.AGF_AGENT_ID
    else process.env.AGF_AGENT_ID = originalEnv
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await nextCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function seed(store: SqliteStore, id: string, status: string, claimedBy?: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status,
      priority: 2,
      createdAt: now,
      updatedAt: now,
      ...(claimedBy ? { metadata: { claimedBy } } : {}),
    } as GraphNode)
  }

  it('AC1 (com identidade): task in_progress de outra formiga NAO e retornada e o envelope avisa FOREIGN_WIP', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-hijack-a-'))
    const store = SqliteStore.open(dir)
    store.initProject('hijack-a')
    seed(store, 'alheia', 'in_progress', 'formiga-a')
    seed(store, 'livre', 'backlog')
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir, '--agent', 'formiga-b'])
    expect(result.ok).toBe(true)
    const data = result.data as { node: { id: string } }
    expect(data.node.id).toBe('livre')
    const raw = JSON.stringify(result)
    expect(raw).toContain('FOREIGN_WIP')
    expect(raw).toContain('formiga-a')
  })

  it('AC1 (sem identidade): in_progress com dono NAO vira wip-idempotent — pull normal com aviso FOREIGN_WIP', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-hijack-b-'))
    const store = SqliteStore.open(dir)
    store.initProject('hijack-b')
    seed(store, 'alheia', 'in_progress', 'formiga-a')
    seed(store, 'livre', 'backlog')
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { node: { id: string }; reason?: string }
    expect(data.node.id).toBe('livre')
    expect(data.reason).not.toBe('wip-idempotent')
    expect(JSON.stringify(result)).toContain('FOREIGN_WIP')
  })

  it('AC2: a propria formiga reexecutando next recebe a PROPRIA task in_progress (restart recovery)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-hijack-c-'))
    const store = SqliteStore.open(dir)
    store.initProject('hijack-c')
    seed(store, 'minha', 'in_progress', 'formiga-a')
    seed(store, 'livre', 'backlog')
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir, '--agent', 'formiga-a'])
    expect(result.ok).toBe(true)
    const data = result.data as { node: { id: string }; reason: string }
    expect(data.node.id).toBe('minha')
    expect(data.reason).toBe('wip-idempotent')
  })

  it('AC3: in_progress legado SEM claimedBy preserva o wip-idempotent atual no pull sem identidade', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-hijack-d-'))
    const store = SqliteStore.open(dir)
    store.initProject('hijack-d')
    seed(store, 'legado', 'in_progress')
    seed(store, 'livre', 'backlog')
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { node: { id: string }; reason: string }
    expect(data.node.id).toBe('legado')
    expect(data.reason).toBe('wip-idempotent')
  })

  it('claim com identidade PERSISTE claimedBy no metadata do node (dono duravel alem da lease)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-hijack-e-'))
    let store = SqliteStore.open(dir)
    store.initProject('hijack-e')
    seed(store, 'livre', 'backlog')
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir, '--agent', 'formiga-b'])
    expect(result.ok).toBe(true)
    expect((result.data as { node: { id: string } }).node.id).toBe('livre')

    store = SqliteStore.open(dir)
    const node = store.getNodeById('livre')
    store.close()
    expect((node?.metadata as Record<string, unknown> | undefined)?.claimedBy).toBe('formiga-b')
  })
})

describe('nextCommand — caminho plain respeita leases e arquivos em voo (node_77ee0139ce8d)', () => {
  let dir: string
  const originalEnv = process.env.AGF_AGENT_ID

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.AGF_AGENT_ID
    else process.env.AGF_AGENT_ID = originalEnv
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await nextCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function seed(store: SqliteStore, id: string, priority: number, extra: Partial<GraphNode> = {}): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'backlog',
      priority,
      createdAt: now,
      updatedAt: now,
      ...extra,
    } as GraphNode)
  }

  it('AC1: task com lease viva de outro agente NÃO é retornada pelo next SEM identidade', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-plainlock-'))
    const store = SqliteStore.open(dir)
    store.initProject('plainlock')
    seed(store, 't1', 1)
    seed(store, 't2', 2)
    const { LockManager } = await import('../core/store/lock-manager.js')
    new LockManager(store.getDb()).acquire('task:t1', 'outra-formiga', 300)
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { node: { id: string } }).node.id).toBe('t2')
  })

  it('AC2: candidata que colide com arquivos declarados de in_progress alheio é pulada no plain', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-plainfiles-'))
    const store = SqliteStore.open(dir)
    store.initProject('plainfiles')
    seed(store, 'voo-a', 1, {
      status: 'in_progress',
      metadata: { claimedBy: 'outra-formiga' },
      implementationFiles: ['src/x.ts'],
    })
    seed(store, 'colide', 1, { implementationFiles: ['src/x.ts'] })
    seed(store, 'segura', 2, { implementationFiles: ['src/y.ts'] })
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { node: { id: string } }).node.id).toBe('segura')
  })

  it('AC3: sem leases e sem in_progress, a task retornada é idêntica à de antes (byte-idêntico)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-plainsame-'))
    const store = SqliteStore.open(dir)
    store.initProject('plainsame')
    seed(store, 't1', 1)
    seed(store, 't2', 2)
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { node: { id: string } }).node.id).toBe('t1')
  })
})

describe('nextCommand — validates the agent claim input (node_wire_ce59fcec8a91 — planner/validation.ts wire)', () => {
  let dir: string
  const originalEnv = process.env.AGF_AGENT_ID

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.AGF_AGENT_ID
    else process.env.AGF_AGENT_ID = originalEnv
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await nextCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('calls validateNextTaskInput with the resolved agentId before claiming', async () => {
    const { validateNextTaskInput } = await import('../core/planner/validation.js')
    vi.mocked(validateNextTaskInput).mockClear()

    dir = mkdtempSync(join(tmpdir(), 'agf-next-validate-'))
    const store = SqliteStore.open(dir)
    store.initProject('next-validate-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 't1',
      type: 'task',
      title: 'Task t1',
      status: 'backlog',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir, '--agent', 'flag-agent'])
    expect(result.ok).toBe(true)
    expect(validateNextTaskInput).toHaveBeenCalledWith({ agentId: 'flag-agent' })
  })
})
