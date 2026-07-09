/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/providers/opencode.ts — importOpenCodeSettings + opencodeAliases.
 * pluginDirs is overridden to [] so the scan never touches the real filesystem.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { importOpenCodeSettings, opencodeAliases } from '../core/hooks/providers/opencode.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'opencode-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('opencodeAliases', () => {
  it('maps opencode events to mcp-graph channels', () => {
    expect(opencodeAliases['pre-tool']).toBe('tool:pre-call')
    expect(opencodeAliases['post-tool']).toBe('tool:post-call')
    expect(opencodeAliases['session.start']).toBe('session:start')
    expect(opencodeAliases['session.end']).toBe('session:end')
  })
})

describe('importOpenCodeSettings', () => {
  it('skips with a not-found reason when the config is missing', () => {
    const result = importOpenCodeSettings({ source: path.join(dir, 'nope.toml'), pluginDirs: [] })

    expect(result.provider).toBe('opencode')
    expect(result.imported).toEqual([])
    expect(result.pluginsDiscovered).toEqual([])
    expect(result.skipped[0].reason).toContain('source not found')
  })

  it('imports hook entries as shell handlers on mapped channels', async () => {
    const source = path.join(dir, 'config.toml')
    await writeFile(source, ['[hooks]', 'pre-tool = "/x/pre.sh"', 'post-tool = "/x/post.sh"'].join('\n'))

    const result = importOpenCodeSettings({ source, pluginDirs: [] })

    expect(result.provider).toBe('opencode')
    expect(result.imported.length).toBeGreaterThanOrEqual(2)
    const channels = result.imported.map((h) => h.channel)
    expect(channels).toContain('tool:pre-call')
    expect(channels).toContain('tool:post-call')
  })
})
