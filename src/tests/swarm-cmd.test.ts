/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_9a1d912ce68d — `agf swarm` makes the swarm fabric invocable: session
 * lifecycle, claim/lease, mailbox, consensus. Persists to the migrated tables.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { swarmCommand } from '../cli/commands/swarm-cmd.js'

interface Envelope {
  ok: boolean
  code?: string
  data?: unknown
}

function lastEnvelope(captured: string[]): Envelope {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1]) as Envelope
}

describe('agf swarm command (#node_9a1d912ce68d)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-swarm-'))
    const store = SqliteStore.open(dir) // runs migrations → swarm/a2a/lock tables
    store.initProject('swarm-test')
    store.close()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function run(args: string[]): Promise<Envelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await swarmCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('init creates a pending session persisted to the graph', async () => {
    const env = await run(['init', '--topology', 'star', '--consensus', 'majority', '--max', '4', '-d', dir])
    expect(env.ok).toBe(true)
    expect((env.data as { status: string }).status).toBe('pending')
  })

  it('claim then a second agent gets CLAIM_CONFLICT', async () => {
    const first = await run(['claim', 'node_x', '--agent', 'a1', '-d', dir])
    expect(first.ok).toBe(true)
    const second = await run(['claim', 'node_x', '--agent', 'a2', '-d', dir])
    expect(second.ok).toBe(false)
    expect(second.code).toBe('CLAIM_CONFLICT')
  })

  it('send → recv delivers the message body', async () => {
    await run(['send', '--from', 'a', '--to', 'b', '--body', '{"hint":"x"}', '-d', dir])
    const env = await run(['recv', 'b', '-d', dir])
    expect(env.ok).toBe(true)
    expect((env.data as { message: { body: { hint: string } } }).message.body.hint).toBe('x')
  })

  it('consensus consolidates votes by majority', async () => {
    const votes = JSON.stringify([
      { agentId: 'a1', value: 'pass' },
      { agentId: 'a2', value: 'pass' },
      { agentId: 'a3', value: 'fail' },
    ])
    const env = await run(['consensus', '--votes', votes])
    expect(env.ok).toBe(true)
    expect((env.data as { winner: string }).winner).toBe('pass')
  })

  it('agents lists heartbeat-derived activity (node_wire_c8134b52d315)', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    store
      .getDb()
      .prepare(`INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)`)
      .run('agent:heartbeat', '{}', 'agent-1', now)
    store.close()

    const env = await run(['agents', '-d', dir])
    expect(env.ok).toBe(true)
    const data = env.data as { agents: Array<{ agentId: string; status: string }> }
    expect(data.agents).toHaveLength(1)
    expect(data.agents[0]!.agentId).toBe('agent-1')
    expect(data.agents[0]!.status).toBe('active')
  })

  it('agents returns empty list when no heartbeats exist', async () => {
    const env = await run(['agents', '-d', dir])
    expect(env.ok).toBe(true)
    expect((env.data as { agents: unknown[] }).agents).toEqual([])
  })
})

describe('agf swarm fan-out — delegated briefs, budget-gated (node_wire_774b9ffc9fc4)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-swarm-fanout-'))
    const store = SqliteStore.open(dir)
    store.initProject('swarm-fanout-test')
    const now = new Date().toISOString()
    for (const id of ['node_a', 'node_b', 'node_c']) {
      store.insertNode({
        id,
        type: 'task',
        title: `Task ${id}`,
        description: `Implement ${id} end-to-end`,
        status: 'backlog',
        priority: 3,
        createdAt: now,
        updatedAt: now,
      } as Parameters<typeof store.insertNode>[0])
    }
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function run(args: string[]): Promise<Envelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await swarmCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('builds a brief per node and finishes all_done when no --max-tokens is given', async () => {
    const env = await run(['fan-out', '--nodes', 'node_a,node_b,node_c', '-d', dir])
    expect(env.ok).toBe(true)
    const data = env.data as { report: { completed: number; stopped: string }; briefs: Record<string, unknown> }
    expect(data.report.completed).toBe(3)
    expect(data.report.stopped).toBe('all_done')
    expect(Object.keys(data.briefs)).toEqual(['node_a', 'node_b', 'node_c'])
  })

  it('stops the fan-out once --max-tokens is exceeded', async () => {
    const env = await run(['fan-out', '--nodes', 'node_a,node_b,node_c', '--max-tokens', '1', '-d', dir])
    expect(env.ok).toBe(true)
    const data = env.data as { report: { completed: number; stopped: string } }
    expect(data.report.stopped).toBe('budget_exceeded')
    expect(data.report.completed).toBeLessThan(3)
  })

  it('reports a failure (not a crash) for an unknown node id', async () => {
    const env = await run(['fan-out', '--nodes', 'node_a,node_missing', '-d', dir])
    expect(env.ok).toBe(true)
    const data = env.data as { report: { completed: number; failed: number }; briefs: Record<string, unknown> }
    expect(data.report.completed).toBe(1)
    expect(data.report.failed).toBe(1)
    expect(Object.keys(data.briefs)).toEqual(['node_a'])
  })

  it('--dedupe flags a brief whose intent duplicates a sibling (node_wire_724b28086719)', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_dup',
      type: 'task',
      title: 'Task node_dup',
      description: 'Implement node_a end-to-end', // same intent as node_a
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    } as Parameters<typeof store.insertNode>[0])
    store.close()

    const env = await run(['fan-out', '--nodes', 'node_a,node_dup', '--dedupe', '-d', dir])
    expect(env.ok).toBe(true)
    const data = env.data as { report: { completed: number; deduped: number } }
    expect(data.report.completed).toBe(2)
    expect(data.report.deduped).toBe(1)
  })

  it('without --dedupe, duplicate intents are not flagged', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_dup2',
      type: 'task',
      title: 'Task node_dup2',
      description: 'Implement node_a end-to-end',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    } as Parameters<typeof store.insertNode>[0])
    store.close()

    const env = await run(['fan-out', '--nodes', 'node_a,node_dup2', '-d', dir])
    expect(env.ok).toBe(true)
    const data = env.data as { report: { completed: number; deduped: number } }
    expect(data.report.completed).toBe(2)
    expect(data.report.deduped).toBe(0)
  })
})

describe('agf swarm consensus — auto-promote bridge (node_wire_572b860d8df7)', () => {
  let dir: string
  const originalEnv = process.env.MCP_GRAPH_SWARM_AUTO_PROMOTE

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-swarm-promote-'))
    delete process.env.MCP_GRAPH_SWARM_AUTO_PROMOTE
    const store = SqliteStore.open(dir)
    store.initProject('swarm-promote-test')
    store.insertNode({
      id: 'node_root',
      type: 'task',
      title: 'Root task',
      status: 'backlog',
      priority: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Parameters<typeof store.insertNode>[0])
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.MCP_GRAPH_SWARM_AUTO_PROMOTE
    else process.env.MCP_GRAPH_SWARM_AUTO_PROMOTE = originalEnv
    vi.restoreAllMocks()
  })

  async function run(args: string[]): Promise<Envelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await swarmCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('does not call verifyAndPromote when --node-id/--auto-promote are omitted (default, zero regression)', async () => {
    const votes = JSON.stringify([
      { agentId: 'a1', value: 'pass' },
      { agentId: 'a2', value: 'pass' },
    ])
    const env = await run(['consensus', '--votes', votes, '-d', dir])
    expect(env.ok).toBe(true)
    expect((env.data as { promotion?: unknown }).promotion).toBeUndefined()
  })

  it('calls verifyAndPromote for real when consensus is reached and --node-id/--auto-promote are given', async () => {
    const votes = JSON.stringify([
      { agentId: 'a1', value: 'pass' },
      { agentId: 'a2', value: 'pass' },
    ])
    const env = await run(['consensus', '--votes', votes, '--node-id', 'node_root', '--auto-promote', '-d', dir])
    expect(env.ok).toBe(true)
    const data = env.data as { promotion?: { promoted: string[]; rejected: unknown[] } }
    expect(data.promotion).toBeDefined()
    expect(Array.isArray(data.promotion?.promoted)).toBe(true)
    expect(Array.isArray(data.promotion?.rejected)).toBe(true)
  })

  it('MCP_GRAPH_SWARM_AUTO_PROMOTE=off disables the bridge even with --node-id/--auto-promote', async () => {
    process.env.MCP_GRAPH_SWARM_AUTO_PROMOTE = 'off'
    const votes = JSON.stringify([
      { agentId: 'a1', value: 'pass' },
      { agentId: 'a2', value: 'pass' },
    ])
    const env = await run(['consensus', '--votes', votes, '--node-id', 'node_root', '--auto-promote', '-d', dir])
    expect(env.ok).toBe(true)
    expect((env.data as { promotion?: unknown }).promotion).toBeUndefined()
  })

  it('does not call verifyAndPromote when consensus is NOT reached, even with the flags set', async () => {
    const votes = JSON.stringify([
      { agentId: 'a1', value: 'pass' },
      { agentId: 'a2', value: 'fail' },
    ]) // 1-1 tie → no strict majority
    const env = await run(['consensus', '--votes', votes, '--node-id', 'node_root', '--auto-promote', '-d', dir])
    expect(env.ok).toBe(true)
    expect((env.data as { reached: boolean }).reached).toBe(false)
    expect((env.data as { promotion?: unknown }).promotion).toBeUndefined()
  })
})
