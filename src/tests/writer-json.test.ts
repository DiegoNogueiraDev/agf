import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initJson, updateJson } from '../core/atomic-files/writer-json.js'

describe('initJson', () => {
  let tmpDir: string
  let filePath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'writer-json-test-'))
    filePath = join(tmpDir, 'config.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates file with defaults and managed metadata', () => {
    initJson(filePath, ['host', 'port'], { host: 'localhost', port: 5432 })
    expect(existsSync(filePath)).toBe(true)
    const content = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(content.host).toBe('localhost')
    expect(content.port).toBe(5432)
    expect(content._managedSchemaVersion).toBe(1)
    expect(content._managedFields).toContain('host')
  })

  it('is noop when file already exists', () => {
    initJson(filePath, ['x'], { x: 1 })
    initJson(filePath, ['x'], { x: 999 })
    const content = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(content.x).toBe(1)
  })

  it('creates parent directories if needed', () => {
    const nested = join(tmpDir, 'a', 'b', 'c.json')
    initJson(nested, [], {})
    expect(existsSync(nested)).toBe(true)
  })
})

describe('updateJson', () => {
  let tmpDir: string
  let filePath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'writer-json-update-test-'))
    filePath = join(tmpDir, 'config.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates file when it does not exist', () => {
    updateJson(filePath, ['host'], { host: 'newhost' })
    expect(existsSync(filePath)).toBe(true)
  })

  it('updates only managed fields', () => {
    initJson(filePath, ['host'], { host: 'original', customKey: 'preserved' })
    updateJson(filePath, ['host'], { host: 'updated', customKey: 'ignored' })
    const content = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(content.host).toBe('updated')
    expect(content.customKey).toBe('preserved')
  })

  it('preserves custom user keys not in managed list', () => {
    initJson(filePath, ['version'], { version: 1 })
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    raw.userKey = 'keep-me'
    writeFileSync(filePath, JSON.stringify(raw, null, 2))
    updateJson(filePath, ['version'], { version: 2 })
    const updated = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(updated.userKey).toBe('keep-me')
  })
})
