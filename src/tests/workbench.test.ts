import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string
let origCwd: string

beforeEach(() => {
  origCwd = process.cwd()
  tmpDir = mkdtempSync(join(tmpdir(), 'agf-workbench-'))
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(origCwd)
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('listHelpers', () => {
  it('returns empty array when no helpers file exists', async () => {
    const { listHelpers } = await import('../tui/workbench.js')
    const result = listHelpers()
    expect(result).toEqual([])
  })

  it('returns empty array when helpers file has no @workbench entries', async () => {
    const { listHelpers } = await import('../tui/workbench.js')
    mkdirSync(join(tmpDir, '.agents', 'workbench'), { recursive: true })
    writeFileSync(join(tmpDir, '.agents', 'workbench', 'helpers.ts'), 'export function plain() {}\n')
    expect(listHelpers()).toEqual([])
  })

  it('parses @workbench entries from helpers file', async () => {
    const { listHelpers } = await import('../tui/workbench.js')
    mkdirSync(join(tmpDir, '.agents', 'workbench'), { recursive: true })
    const content = ['// @workbench name: myHelper', 'export function myHelper() {', '  return 42', '}'].join('\n')
    writeFileSync(join(tmpDir, '.agents', 'workbench', 'helpers.ts'), content + '\n')
    const entries = listHelpers()
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('myHelper')
    expect(entries[0].path).toBe('helpers.ts')
  })
})

describe('loadWorkbench', () => {
  it('returns empty string when file does not exist', async () => {
    const { loadWorkbench } = await import('../tui/workbench.js')
    expect(loadWorkbench()).toBe('')
  })

  it('returns file content when file exists', async () => {
    const { loadWorkbench, saveWorkbench } = await import('../tui/workbench.js')
    saveWorkbench('export const x = 1\n')
    expect(loadWorkbench()).toBe('export const x = 1\n')
  })
})

describe('saveWorkbench', () => {
  it('creates the workbench file in .agents/workbench/', async () => {
    const { saveWorkbench } = await import('../tui/workbench.js')
    saveWorkbench('// test')
    const fp = join(tmpDir, '.agents', 'workbench', 'helpers.ts')
    expect(existsSync(fp)).toBe(true)
  })

  it('overwrites existing content', async () => {
    const { saveWorkbench, loadWorkbench } = await import('../tui/workbench.js')
    saveWorkbench('first')
    saveWorkbench('second')
    expect(loadWorkbench()).toBe('second')
  })
})

describe('addWorkbenchEntry', () => {
  it('appends a @workbench-annotated function', async () => {
    const { addWorkbenchEntry, loadWorkbench } = await import('../tui/workbench.js')
    addWorkbenchEntry('greet', 'return "hello"')
    const content = loadWorkbench()
    expect(content).toContain('// @workbench name: greet')
    expect(content).toContain('export function greet()')
    expect(content).toContain('return "hello"')
  })

  it('accumulates multiple entries without overwriting', async () => {
    const { addWorkbenchEntry, loadWorkbench } = await import('../tui/workbench.js')
    addWorkbenchEntry('fn1', 'return 1')
    addWorkbenchEntry('fn2', 'return 2')
    const content = loadWorkbench()
    expect(content).toContain('fn1')
    expect(content).toContain('fn2')
  })
})
