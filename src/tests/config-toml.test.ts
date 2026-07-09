import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, existsSync, mkdirSync, existsSync as exists } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig, parseConfigFile, isBuiltinConfig } from '../core/config/config-loader.js'

function tmpDir(): string {
  const dir = join(tmpdir(), `agf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanup(dir: string): void {
  for (const f of ['mcp-graph.config.json', 'mcp-graph.config.toml']) {
    const p = join(dir, f)
    if (existsSync(p)) unlinkSync(p)
  }
  // don't remove the dir — might still be in use
}

describe('Config loader — TOML support', () => {
  it('loads JSON config unchanged (backward compatible)', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({ port: 4242 }))
    const config = loadConfig(dir)
    expect(config.port).toBe(4242)
    cleanup(dir)
  })

  it('loads TOML config', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.toml'), 'port = 5252\n')
    const config = loadConfig(dir)
    expect(config.port).toBe(5252)
    cleanup(dir)
  })

  it('prefers JSON over TOML when both exist', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({ port: 1111 }))
    writeFileSync(join(dir, 'mcp-graph.config.toml'), 'port = 2222\n')
    const config = loadConfig(dir)
    expect(config.port).toBe(1111)
    cleanup(dir)
  })

  it('returns defaults when no config file exists', () => {
    const dir = tmpDir()
    const config = loadConfig(dir)
    expect(config.port).toBe(3000) // default
  })
})

describe('Config loader — env var override', () => {
  it('overrides port via MCP_PORT', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({ port: 3000 }))
    try {
      process.env.MCP_PORT = '9999'
      const config = loadConfig(dir)
      expect(config.port).toBe(9999)
    } finally {
      delete process.env.MCP_PORT
      cleanup(dir)
    }
  })

  it('overrides dbPath via MCP_GRAPH_DB_PATH', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({ dbPath: 'my-db' }))
    try {
      process.env.MCP_GRAPH_DB_PATH = '/custom/path'
      const config = loadConfig(dir)
      expect(config.dbPath).toBe('/custom/path')
    } finally {
      delete process.env.MCP_GRAPH_DB_PATH
      cleanup(dir)
    }
  })
})

describe('Config loader — source tracking', () => {
  it('parseConfigFile reports isFromDefaultLocation when file found', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({ port: 5555 }))
    const result = parseConfigFile(dir)
    expect(result.config.port).toBe(5555)
    expect(result.isFromDefaultLocation).toBe(true)
    cleanup(dir)
  })

  it('parseConfigFile returns parsed config with source flag', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({ port: 7777 }))
    const result = parseConfigFile(dir)
    expect(result.config.port).toBe(7777)
    expect(result.isFromDefaultLocation).toBe(true)
    cleanup(dir)
  })
})

describe('Config loader — cross-field validation', () => {
  it('rejects invalid port range', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({ port: 99999 }))
    expect(() => loadConfig(dir)).toThrow()
    cleanup(dir)
  })

  it('accepts valid config with all defaults', () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'mcp-graph.config.json'), JSON.stringify({}))
    const config = loadConfig(dir)
    expect(config.port).toBeGreaterThanOrEqual(1)
    expect(config.port).toBeLessThanOrEqual(65535)
    cleanup(dir)
  })
})
