import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { codeCommand } from '../cli/commands/code-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { CodeStore } from '../core/code/code-store.js'

describe('codeCommand', () => {
  it('returns a Command instance', () => {
    const cmd = codeCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = codeCommand()
    expect(cmd.name()).toBe('code')
  })

  it('has a non-empty description', () => {
    const cmd = codeCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = codeCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })

  it('registers the skeleton-plan subcommand', () => {
    const cmd = codeCommand()
    expect(cmd.commands.map((c) => c.name())).toContain('skeleton-plan')
  })

  it('registers the deep-modules subcommand', () => {
    const cmd = codeCommand()
    expect(cmd.commands.map((c) => c.name())).toContain('deep-modules')
  })

  it('registers the seams subcommand', () => {
    const cmd = codeCommand()
    expect(cmd.commands.map((c) => c.name())).toContain('seams')
  })
})

describe('codeCommand inspect-config', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(file: string): Promise<{ ok: boolean; data?: unknown; code?: string }> {
    const out: string[] = []
    const write = (chunk: unknown): boolean => {
      out.push(String(chunk))
      return true
    }
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = write as typeof process.stdout.write
    try {
      await codeCommand().parseAsync(['inspect-config', file], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    return JSON.parse(out.join('').trim())
  }

  it('parses a .yaml file into structured entries', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-inspect-yaml-'))
    const file = join(dir, 'config.yaml')
    writeFileSync(file, 'name: agf\nport: 8080\n')

    const envelope = await run(file)
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toMatchObject({ format: 'yaml' })
    const data = envelope.data as { entries: Array<{ key: string }> }
    expect(data.entries.map((e) => e.key)).toEqual(['name', 'port'])
  })

  it('parses a .env file and flags secret-looking keys', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-inspect-env-'))
    const file = join(dir, '.env')
    writeFileSync(file, 'API_SECRET=xyz\nPORT=3000\n')

    const envelope = await run(file)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { entries: Array<{ key: string; isSecret: boolean }> }
    expect(data.entries.find((e) => e.key === 'API_SECRET')?.isSecret).toBe(true)
    expect(data.entries.find((e) => e.key === 'PORT')?.isSecret).toBe(false)
  })

  it('parses a bare Makefile by basename (no extension)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-inspect-makefile-'))
    const file = join(dir, 'Makefile')
    writeFileSync(file, 'build:\n\techo hi\n')

    const envelope = await run(file)
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toMatchObject({ format: 'makefile' })
  })

  it('rejects an unrecognized file with UNSUPPORTED_FORMAT', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-inspect-unknown-'))
    const file = join(dir, 'notes.xyz')
    writeFileSync(file, 'whatever')

    const envelope = await run(file)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('UNSUPPORTED_FORMAT')
  })
})

describe('codeCommand refs', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('delegates to findReferencingSymbols and returns file/line/snippet references', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-code-refs-'))
    const store = SqliteStore.open(dir)
    store.initProject('code-refs-test')
    const project = store.getProject()!
    const codeStore = new CodeStore(store.getDb())

    const target = codeStore.insertSymbol({
      projectId: project.id,
      name: 'targetFn',
      kind: 'function',
      file: 'src/target.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
    })
    const caller = codeStore.insertSymbol({
      projectId: project.id,
      name: 'callerFn',
      kind: 'function',
      file: 'src/caller.ts',
      startLine: 10,
      endLine: 15,
      exported: true,
      sourceSnippet: 'targetFn()',
    })
    codeStore.insertRelation({
      projectId: project.id,
      fromSymbol: caller.id,
      toSymbol: target.id,
      type: 'calls',
      file: 'src/caller.ts',
      line: 12,
    })
    store.close()

    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await codeCommand().parseAsync(['refs', 'targetFn', '-d', dir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    const envelope = JSON.parse(out.join('').trim())

    expect(envelope.ok).toBe(true)
    expect(envelope.data.count).toBe(1)
    expect(envelope.data.references[0]).toMatchObject({ file: 'src/caller.ts', line: 12 })
  })
})

describe('codeCommand context (node_wire_126dee0992f3 — enriched-context wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('combines project memories + code graph symbol data for a symbol', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-code-context-'))
    const store = SqliteStore.open(dir)
    store.initProject('code-context-test')
    const project = store.getProject()!
    const codeStore = new CodeStore(store.getDb())
    codeStore.upsertIndexMeta({
      projectId: project.id,
      lastIndexed: new Date().toISOString(),
      fileCount: 1,
      symbolCount: 1,
      relationCount: 0,
    })
    codeStore.insertSymbol({
      projectId: project.id,
      name: 'targetFn',
      kind: 'function',
      file: 'src/target.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
    })
    store.close()

    mkdirSync(join(dir, 'workflow-graph', 'memories'), { recursive: true })
    writeFileSync(
      join(dir, 'workflow-graph', 'memories', 'targetfn-notes.md'),
      '---\nname: targetfn-notes\n---\ntargetFn handles the critical path.',
    )

    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await codeCommand().parseAsync(['context', 'targetFn', '-d', dir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    const envelope = JSON.parse(out.join('').trim())

    expect(envelope.ok).toBe(true)
    expect(envelope.data.symbol).toBe('targetFn')
    expect(envelope.data.memories.available).toBe(true)
    expect(envelope.data.memories.relevantMemories.length).toBeGreaterThan(0)
    expect(envelope.data.codeGraph.available).toBe(true)
    expect(envelope.data.combined).toContain('targetFn')
  })
})

describe('codeCommand search — rerank/groupByModule via searchCodeSymbols', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function runSearch(args: string[]): Promise<{ ok: boolean; data?: unknown[] }> {
    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await codeCommand().parseAsync(['search', ...args, '-d', dir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    return JSON.parse(out.join('').trim())
  }

  it('accepts --rerank without throwing and still returns matching symbols', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-code-search-'))
    const store = SqliteStore.open(dir)
    store.initProject('code-search-test')
    const project = store.getProject()!
    const codeStore = new CodeStore(store.getDb())
    codeStore.insertSymbol({
      projectId: project.id,
      name: 'validateNode',
      kind: 'function',
      file: 'src/validate.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
    })
    store.close()

    const envelope = await runSearch(['validate', '--rerank'])
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'validateNode' })]))
  })
})

describe('codeCommand sync-check', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function runSyncCheck(): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await codeCommand().parseAsync(['sync-check', '-d', dir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    return JSON.parse(out.join('').trim())
  }

  it('flags a node whose sourceRef points at a file missing from the code index', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-sync-check-'))
    const store = SqliteStore.open(dir)
    store.initProject('sync-check-test')
    const project = store.getProject()!
    const codeStore = new CodeStore(store.getDb())
    codeStore.insertSymbol({
      projectId: project.id,
      name: 'realFn',
      kind: 'function',
      file: 'src/real.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
    })
    codeStore.upsertIndexMeta({
      projectId: project.id,
      lastIndexed: new Date().toISOString(),
      fileCount: 1,
      symbolCount: 1,
      relationCount: 0,
    })
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_drift',
      type: 'task',
      title: 'Node with stale sourceRef',
      status: 'done',
      priority: 3,
      sourceRef: { file: 'src/deleted.ts' },
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    store.close()

    const envelope = await runSyncCheck()
    expect(envelope.ok).toBe(true)
    const staleRefs = envelope.data?.staleRefs as string[]
    expect(staleRefs.some((s) => s.includes('src/deleted.ts'))).toBe(true)
  })
})

describe('codeCommand processes', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('detects an exported symbol with no incoming calls as an entry point and traces its call chain', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-code-processes-'))
    const store = SqliteStore.open(dir)
    store.initProject('code-processes-test')
    const project = store.getProject()!
    const codeStore = new CodeStore(store.getDb())

    const entry = codeStore.insertSymbol({
      projectId: project.id,
      name: 'main',
      kind: 'function',
      file: 'src/main.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
    })
    const callee = codeStore.insertSymbol({
      projectId: project.id,
      name: 'helper',
      kind: 'function',
      file: 'src/helper.ts',
      startLine: 1,
      endLine: 5,
      exported: false,
    })
    codeStore.insertRelation({
      projectId: project.id,
      fromSymbol: entry.id,
      toSymbol: callee.id,
      type: 'calls',
    })
    store.close()

    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await codeCommand().parseAsync(['processes', '-d', dir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    const envelope = JSON.parse(out.join('').trim())

    expect(envelope.ok).toBe(true)
    const processes = envelope.data.processes as Array<{ entryPoint: string; chain: Array<{ name: string }> }>
    const mainProcess = processes.find((p) => p.entryPoint === 'main')
    expect(mainProcess).toBeDefined()
    expect(mainProcess?.chain.map((c) => c.name)).toContain('helper')
  })
})
