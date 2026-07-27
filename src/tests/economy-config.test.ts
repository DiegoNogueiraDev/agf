import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadEconomyConfig, DEFAULT_LEVER_CONFIG } from '../core/economy/economy-config.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agf-economy-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function writeToml(content: string): void {
  mkdirSync(join(tmpDir, '.agf'), { recursive: true })
  writeFileSync(join(tmpDir, '.agf', 'economy.toml'), content, 'utf8')
}

describe('DEFAULT_LEVER_CONFIG', () => {
  it('defines defaults for ast_compress, caveman, ccr, rag_in, and rag_out', () => {
    expect(DEFAULT_LEVER_CONFIG.ast_compress).toBeDefined()
    expect(DEFAULT_LEVER_CONFIG.caveman).toBeDefined()
    expect(DEFAULT_LEVER_CONFIG.ccr).toBeDefined()
    expect(DEFAULT_LEVER_CONFIG.rag_in).toBeDefined()
    expect(DEFAULT_LEVER_CONFIG.rag_out).toBeDefined()
  })

  it('ast_compress.min_bytes is a positive integer', () => {
    expect(DEFAULT_LEVER_CONFIG.ast_compress.min_bytes).toBeGreaterThan(0)
    expect(Number.isInteger(DEFAULT_LEVER_CONFIG.ast_compress.min_bytes)).toBe(true)
  })

  it('caveman.aggressiveness is in [0, 1]', () => {
    const a = DEFAULT_LEVER_CONFIG.caveman.aggressiveness
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(1)
  })

  it('rag_in and rag_out thresholds are in (0, 1]', () => {
    expect(DEFAULT_LEVER_CONFIG.rag_in.threshold).toBeGreaterThan(0)
    expect(DEFAULT_LEVER_CONFIG.rag_in.threshold).toBeLessThanOrEqual(1)
    expect(DEFAULT_LEVER_CONFIG.rag_out.threshold).toBeGreaterThan(0)
    expect(DEFAULT_LEVER_CONFIG.rag_out.threshold).toBeLessThanOrEqual(1)
  })
})

describe('loadEconomyConfig', () => {
  it('returns defaults when .agf/economy.toml is absent', () => {
    const config = loadEconomyConfig(tmpDir)
    expect(config).toEqual(DEFAULT_LEVER_CONFIG)
  })

  it('reads thresholds from a present TOML file', () => {
    writeToml(`
[ast_compress]
min_bytes = 4096

[caveman]
aggressiveness = 0.8
`)
    const config = loadEconomyConfig(tmpDir)
    expect(config.ast_compress.min_bytes).toBe(4096)
    expect(config.caveman.aggressiveness).toBe(0.8)
  })

  it('merges partial TOML — unspecified levers keep defaults', () => {
    writeToml(`
[rag_in]
threshold = 0.7
`)
    const config = loadEconomyConfig(tmpDir)
    expect(config.rag_in.threshold).toBe(0.7)
    // unspecified levers keep defaults
    expect(config.ast_compress.min_bytes).toBe(DEFAULT_LEVER_CONFIG.ast_compress.min_bytes)
    expect(config.caveman.aggressiveness).toBe(DEFAULT_LEVER_CONFIG.caveman.aggressiveness)
  })

  it('merges partial section — unspecified keys within a lever keep defaults', () => {
    writeToml(`
[rag_in]
threshold = 0.9
`)
    const config = loadEconomyConfig(tmpDir)
    expect(config.rag_in.threshold).toBe(0.9)
    expect(config.rag_in.k).toBe(DEFAULT_LEVER_CONFIG.rag_in.k)
  })

  it('returns defaults on unparseable TOML without throwing', () => {
    writeToml('[[invalid toml [broken')
    expect(() => loadEconomyConfig(tmpDir)).not.toThrow()
    const config = loadEconomyConfig(tmpDir)
    expect(config).toEqual(DEFAULT_LEVER_CONFIG)
  })

  it('supports ccr.enabled toggle', () => {
    writeToml(`
[ccr]
enabled = false
`)
    const config = loadEconomyConfig(tmpDir)
    expect(config.ccr.enabled).toBe(false)
  })
})
