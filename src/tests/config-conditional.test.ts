/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { getConfigFilesForCLI, CLI_CONFIG_MAP, type CliConfigFiles } from '../core/cli-provider/config-conditional.js'

describe('getConfigFilesForCLI (CLI-first, zero MCP)', () => {
  it('NEVER includes .mcp.json / mcp.json for any CLI', () => {
    for (const cli of CLI_CONFIG_MAP.keys()) {
      const files = getConfigFilesForCLI(cli)
      for (const f of files) {
        expect(f).not.toContain('.mcp.json')
        expect(f).not.toContain('mcp.json')
      }
    }
  })

  it('returns AGENTS.md for opencode (no MCP json)', () => {
    const files = getConfigFilesForCLI('opencode')
    expect(files).toContain('AGENTS.md')
    expect(files).not.toContain('.mcp.json')
  })

  it('returns copilot-instructions for copilot', () => {
    const files = getConfigFilesForCLI('copilot')
    expect(files).toContain('.github/copilot-instructions.md')
    expect(files).not.toContain('.mcp.json')
  })

  it('returns AGENTS.md for codex', () => {
    const files = getConfigFilesForCLI('codex')
    expect(files).toContain('AGENTS.md')
  })

  it('returns CLAUDE.md for claude', () => {
    const files = getConfigFilesForCLI('claude')
    expect(files).toContain('CLAUDE.md')
  })

  it('returns the full CLI-first set for unknown', () => {
    const files = getConfigFilesForCLI('unknown')
    expect(files).toContain('CLAUDE.md')
    expect(files).toContain('.github/copilot-instructions.md')
    expect(files).toContain('AGENTS.md')
  })

  it('CLI_CONFIG_MAP has entries for all relevant CLIs', () => {
    expect(CLI_CONFIG_MAP.has('opencode')).toBe(true)
    expect(CLI_CONFIG_MAP.has('codex')).toBe(true)
    expect(CLI_CONFIG_MAP.has('copilot')).toBe(true)
    expect(CLI_CONFIG_MAP.has('claude')).toBe(true)
    expect(CLI_CONFIG_MAP.has('cursor')).toBe(true)
    expect(CLI_CONFIG_MAP.has('unknown')).toBe(true)
    expect(CLI_CONFIG_MAP.has('mcp-graph')).toBe(true)
  })
})

describe('CliConfigFiles type', () => {
  it('is string array', () => {
    const files: CliConfigFiles = ['CLAUDE.md']
    expect(Array.isArray(files)).toBe(true)
    expect(files[0]).toBe('CLAUDE.md')
  })
})
