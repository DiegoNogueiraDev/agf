import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { templateCommand } from '../cli/commands/template-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('templateCommand', () => {
  it('returns a Command instance', () => {
    const cmd = templateCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = templateCommand()
    expect(cmd.name()).toBe('template')
  })

  it('has a non-empty description', () => {
    const cmd = templateCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = templateCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })

  it('wires a "registry" sub-group for the persisted task-template store', () => {
    const cmd = templateCommand()
    const registry = cmd.commands.find((c) => c.name() === 'registry')
    expect(registry).toBeDefined()
    expect(registry?.commands.map((c) => c.name())).toEqual(expect.arrayContaining(['list', 'save', 'get', 'rm']))
  })
})

describe('agf template registry (node_wire_7d82c65b41a7 — template-store wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await templateCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('AC1: save then list round-trips a persisted task template', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-template-registry-'))
    const store = SqliteStore.open(dir)
    store.initProject('template-registry-test')
    store.close()

    const subtasks = JSON.stringify([{ title: 'Write tests' }, { title: 'Implement' }])
    const saveResult = await run([
      'registry',
      'save',
      '--name',
      'feature-template',
      '--description',
      'Standard feature delivery',
      '--subtasks',
      subtasks,
      '-d',
      dir,
    ])
    expect(saveResult.ok).toBe(true)

    const listResult = await run(['registry', 'list', '-d', dir])
    expect(listResult.ok).toBe(true)
    const data = listResult.data as { templates: Array<{ name: string }> }
    expect(data.templates.map((t) => t.name)).toContain('feature-template')
  })

  it('AC2: get returns the saved template by name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-template-registry-get-'))
    const store = SqliteStore.open(dir)
    store.initProject('template-registry-get-test')
    store.close()

    await run([
      'registry',
      'save',
      '--name',
      'bugfix-template',
      '--description',
      'Standard bugfix flow',
      '--subtasks',
      JSON.stringify([{ title: 'Reproduce' }]),
      '-d',
      dir,
    ])

    const result = await run(['registry', 'get', 'bugfix-template', '-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { name: string; subtasks: Array<{ title: string }> }
    expect(data.name).toBe('bugfix-template')
    expect(data.subtasks[0]!.title).toBe('Reproduce')
  })

  it('AC3: get on unknown name errors NOT_FOUND', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-template-registry-missing-'))
    const store = SqliteStore.open(dir)
    store.initProject('template-registry-missing-test')
    store.close()

    const result = await run(['registry', 'get', 'nonexistent', '-d', dir])
    expect(result.ok).toBe(false)
  })

  it('AC4: rm removes the template so it no longer lists', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-template-registry-rm-'))
    const store = SqliteStore.open(dir)
    store.initProject('template-registry-rm-test')
    store.close()

    await run([
      'registry',
      'save',
      '--name',
      'throwaway-template',
      '--description',
      'To be removed',
      '--subtasks',
      JSON.stringify([{ title: 'Do the thing' }]),
      '-d',
      dir,
    ])

    const rmResult = await run(['registry', 'rm', 'throwaway-template', '-d', dir])
    expect(rmResult.ok).toBe(true)

    const listResult = await run(['registry', 'list', '-d', dir])
    const data = listResult.data as { templates: Array<{ name: string }> }
    expect(data.templates.map((t) => t.name)).not.toContain('throwaway-template')
  })
})
