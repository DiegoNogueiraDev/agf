import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string
let origCwd: string

beforeEach(() => {
  origCwd = process.cwd()
  tmpDir = mkdtempSync(join(tmpdir(), 'agf-bw-'))
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(origCwd)
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('addBrowserHelper — validation', () => {
  it('rejects invalid name (not snake_case)', async () => {
    const { addBrowserHelper } = await import('../tui/browser-workbench.js')
    const result = addBrowserHelper('MyHelper', 'return 1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Invalid helper name')
  })

  it('rejects empty name', async () => {
    const { addBrowserHelper } = await import('../tui/browser-workbench.js')
    const result = addBrowserHelper('', 'return 1')
    expect(result.ok).toBe(false)
  })

  it('rejects source exceeding 4096 bytes', async () => {
    const { addBrowserHelper } = await import('../tui/browser-workbench.js')
    const bigSource = 'x'.repeat(4097)
    const result = addBrowserHelper('my_fn', bigSource)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('too large')
  })

  it('rejects source with forbidden APIs', async () => {
    const { addBrowserHelper } = await import('../tui/browser-workbench.js')
    const result = addBrowserHelper('my_fn', 'import os\nos.getcwd()')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('forbidden API')
  })

  it('rejects source with eval(', async () => {
    const { addBrowserHelper } = await import('../tui/browser-workbench.js')
    const result = addBrowserHelper('my_fn', 'eval("bad")')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('forbidden API')
  })

  it('accepts valid snake_case name with safe source', async () => {
    const { addBrowserHelper, showBrowserHelper } = await import('../tui/browser-workbench.js')
    const result = addBrowserHelper('get_title', 'return document.title')
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
    const entry = showBrowserHelper('get_title')
    expect(entry).not.toBeNull()
    expect(entry?.source).toBe('return document.title')
  })
})

describe('listBrowserHelpers', () => {
  it('returns empty array when no helpers exist', async () => {
    const { listBrowserHelpers } = await import('../tui/browser-workbench.js')
    expect(listBrowserHelpers()).toEqual([])
  })

  it('lists helpers after adding one', async () => {
    const { addBrowserHelper, listBrowserHelpers } = await import('../tui/browser-workbench.js')
    addBrowserHelper('my_script', 'return 42')
    const helpers = listBrowserHelpers()
    expect(helpers).toHaveLength(1)
    expect(helpers[0].name).toBe('my_script')
    expect(helpers[0].source).toBe('return 42')
  })
})

describe('showBrowserHelper', () => {
  it('returns null for non-existent helper', async () => {
    const { showBrowserHelper } = await import('../tui/browser-workbench.js')
    expect(showBrowserHelper('no_such_fn')).toBeNull()
  })
})
