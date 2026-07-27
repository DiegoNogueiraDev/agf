import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { learningCommand } from '../cli/commands/learning-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { DecisionTableStore } from '../core/learning/decision-table-store.js'
import { decisionKey } from '../core/learning/decision-key.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('learningCommand', () => {
  it('returns a Command instance', () => {
    const cmd = learningCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = learningCommand()
    expect(cmd.name()).toBe('learning')
  })

  it('has a non-empty description', () => {
    const cmd = learningCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = learningCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })

  it('registers a tools subcommand exposing tool-pheromone ACO routing', () => {
    const cmd = learningCommand()
    const tools = cmd.commands.find((c) => c.name() === 'tools')
    expect(tools).toBeDefined()
    const optionNames = tools?.options.map((o) => o.long) ?? []
    expect(optionNames).toContain('--deposit')
    expect(optionNames).toContain('--limit')
  })
})

describe('learning lookup — connects dormant core/learning/decision-fast-path.ts (node_wire_6699883d8b72)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const proc = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await learningCommand().parseAsync(['lookup', ...args], { from: 'user' })
    } finally {
      process.stdout.write = proc
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function initDir(): string {
    const d = mkdtempSync(join(tmpdir(), 'agf-learning-lookup-'))
    const s = SqliteStore.open(d)
    s.initProject('learning-lookup-test')
    s.close()
    return d
  }

  it('AC1: reports a miss (fromFastPath=false) when no decision is compiled for the context', async () => {
    dir = initDir()
    const envelope = await run(['src/core/x', 'BUILD', 'implementer', 'pick model', '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { fromFastPath: boolean; decision: unknown }
    expect(data.fromFastPath).toBe(false)
    expect(data.decision).toBeNull()
  })

  it('AC2: replays the compiled decision (fromFastPath=true) once one exists for the context', async () => {
    dir = initDir()
    const ctx = { domain: 'src/core/x', phase: 'BUILD', role: 'implementer', input: 'pick model' }
    const s = SqliteStore.open(dir)
    const project = s.getProject()
    new DecisionTableStore(s.getDb(), project?.id ?? 'default').put({
      key: decisionKey(ctx),
      decision: { model: 'haiku' },
      successRate: 0.9,
    })
    s.close()

    const envelope = await run([ctx.domain, ctx.phase, ctx.role, ctx.input, '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { fromFastPath: boolean; decision: { model: string } }
    expect(data.fromFastPath).toBe(true)
    expect(data.decision).toEqual({ model: 'haiku' })
  })

  it('AC3: a hit records a zero-token compiled_hit row in the llm_call_ledger for economy attribution', async () => {
    dir = initDir()
    const ctx = { domain: 'src/core/x', phase: 'BUILD', role: 'implementer', input: 'pick model' }
    const s = SqliteStore.open(dir)
    const project = s.getProject()
    new DecisionTableStore(s.getDb(), project?.id ?? 'default').put({
      key: decisionKey(ctx),
      decision: { model: 'haiku' },
      successRate: 0.9,
    })
    s.close()

    await run([ctx.domain, ctx.phase, ctx.role, ctx.input, '--tokens-saved', '1200', '-d', dir])

    const verify = SqliteStore.open(dir)
    const row = verify
      .getDb()
      .prepare("SELECT status, cached_input_tokens FROM llm_call_ledger WHERE caller = 'learning-fast-path'")
      .get() as { status: string; cached_input_tokens: number } | undefined
    verify.close()
    expect(row?.status).toBe('compiled_hit')
    expect(row?.cached_input_tokens).toBe(1200)
  })
})

describe('learning distill — connects dormant core/learning/star-distillation.ts (node_wire_71334c0ce040)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const proc = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await learningCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = proc
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function initDir(): string {
    const d = mkdtempSync(join(tmpdir(), 'agf-learning-distill-'))
    const s = SqliteStore.open(d)
    s.initProject('learning-distill-test')
    s.close()
    return d
  }

  function trace(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      domain: 'src/core/x',
      phase: 'BUILD',
      role: 'implementer',
      input: 'pick model',
      reasoning: 'opus reasoned through it',
      conclusion: 'use haiku',
      success: true,
      ts: 1000,
      ...overrides,
    }
  }

  it('AC1: distills repeated successful traces into a compiled fast-path decision', async () => {
    dir = initDir()
    const traces = [trace({ ts: 1000 }), trace({ ts: 2000 })]
    const envelope = await run(['distill', '--traces', JSON.stringify(traces), '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { observations: number; compiled: number; emittedKeys: string[] }
    expect(data.observations).toBe(2)
    expect(data.compiled).toBe(1)

    const lookup = await run(['lookup', 'src/core/x', 'BUILD', 'implementer', 'pick model', '-d', dir])
    const lookupData = lookup.data as { fromFastPath: boolean; decision: { conclusion: string } }
    expect(lookupData.fromFastPath).toBe(true)
    expect(lookupData.decision.conclusion).toBe('use haiku')
  })

  it('AC2: a single occurrence does not meet the compile gate (skipped, not compiled)', async () => {
    dir = initDir()
    const envelope = await run(['distill', '--traces', JSON.stringify([trace()]), '-d', dir])
    const data = envelope.data as { compiled: number; skipped: number }
    expect(data.compiled).toBe(0)
    expect(data.skipped).toBe(1)
  })

  it('AC3: missing --traces reports MISSING_TRACES instead of crashing', async () => {
    dir = initDir()
    const envelope = await run(['distill', '-d', dir])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('MISSING_TRACES')
  })

  it('AC4: malformed --traces JSON reports INVALID_JSON instead of crashing', async () => {
    dir = initDir()
    const envelope = await run(['distill', '--traces', '{not json', '-d', dir])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('INVALID_JSON')
  })
})

describe('learning trajectory-record / trajectory-recall — connects dormant core/learning/reasoning-bank.ts (node_wire_76117d31c107)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const proc = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await learningCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = proc
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function initDir(): string {
    const d = mkdtempSync(join(tmpdir(), 'agf-learning-trajectory-'))
    const s = SqliteStore.open(d)
    s.initProject('learning-trajectory-test')
    s.insertNode({
      id: 'n1',
      type: 'task',
      title: 'Task n1',
      status: 'backlog',
      priority: 1,
      xpSize: 'M',
      tags: [],
      blocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as GraphNode)
    s.close()
    return d
  }

  it('AC1: records a trajectory and persists it (round-trips outcomeScore + toolSequence)', async () => {
    dir = initDir()
    const envelope = await run(['trajectory-record', 'n1', 'Read,Edit', '--outcome', '0.9', '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { nodeId: string; toolSequence: string[]; outcomeScore: number }
    expect(data.nodeId).toBe('n1')
    expect(data.toolSequence).toEqual(['Read', 'Edit'])
    expect(data.outcomeScore).toBe(0.9)
  })

  it('AC2: recall finds the most similar recorded trajectory first (similarity DESC)', async () => {
    dir = initDir()
    await run(['trajectory-record', 'n1', 'Read,Edit', '--outcome', '0.9', '-d', dir])
    await run(['trajectory-record', 'n1', 'Bash', '--outcome', '0.2', '-d', dir])

    const envelope = await run(['trajectory-recall', 'Read,Edit', '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { matches: Array<{ toolSequence: string[]; similarity: number }> }
    expect(data.matches[0].toolSequence).toEqual(['Read', 'Edit'])
    expect(data.matches[0].similarity).toBe(1)
  })

  it('AC3: --min-score filters recall to only successful trajectories', async () => {
    dir = initDir()
    await run(['trajectory-record', 'n1', 'Read,Edit', '--outcome', '0.9', '-d', dir])
    await run(['trajectory-record', 'n1', 'Read,Edit', '--outcome', '0.1', '-d', dir])

    const envelope = await run(['trajectory-recall', 'Read,Edit', '--min-score', '0.5', '-d', dir])
    const data = envelope.data as { matches: Array<{ outcomeScore: number }> }
    expect(data.matches.length).toBe(1)
    expect(data.matches[0].outcomeScore).toBe(0.9)
  })
})
