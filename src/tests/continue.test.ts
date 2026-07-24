/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/providers/continue.ts — importContinueSettings.
 * Continue.dev has no hook lifecycle: it never imports handlers, only reports
 * the MCP servers it found and always records a skip reason.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { importContinueSettings } from '../core/hooks/providers/continue.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'continue-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('importContinueSettings', () => {
  it('returns an empty import with a not-found skip when the config is missing', () => {
    const missing = path.join(dir, 'does-not-exist.json')
    const result = importContinueSettings({ source: missing })

    expect(result.provider).toBe('continue')
    expect(result.imported).toEqual([])
    expect(result.mcpServers).toEqual([])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toContain('source not found')
  })

  it('lists configured MCP servers and never imports a hook handler', async () => {
    const source = path.join(dir, 'config.json')
    await writeFile(source, JSON.stringify({ mcpServers: { alpha: {}, beta: {} } }))

    const result = importContinueSettings({ source })

    expect(result.provider).toBe('continue')
    expect(result.mcpServers.sort()).toEqual(['alpha', 'beta'])
    expect(result.imported).toEqual([])
    // Skip reason explains why nothing is wired as a lifecycle hook.
    expect(result.skipped[0].reason.toLowerCase()).toContain('mcp')
  })

  it('treats a config with no mcpServers key as zero servers', async () => {
    const source = path.join(dir, 'empty.json')
    await writeFile(source, JSON.stringify({}))

    const result = importContinueSettings({ source })

    expect(result.mcpServers).toEqual([])
    expect(result.imported).toEqual([])
  })
})
