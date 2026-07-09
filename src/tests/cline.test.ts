/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/providers/cline.ts — importClineSettings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { importClineSettings } from '../core/hooks/providers/cline.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cline-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('importClineSettings', () => {
  it('skips with a not-found reason when settings.json is missing', () => {
    const result = importClineSettings({ source: path.join(dir, 'settings.json') })

    expect(result.provider).toBe('cline')
    expect(result.imported).toEqual([])
    expect(result.mcpServers).toEqual([])
    expect(result.skipped[0].reason).toContain('source not found')
  })

  it('lists cline.mcpServers and never imports a hook handler', async () => {
    const source = path.join(dir, 'settings.json')
    await writeFile(source, JSON.stringify({ 'cline.mcpServers': { gitmcp: {}, fs: {} } }))

    const result = importClineSettings({ source })

    expect(result.mcpServers.sort()).toEqual(['fs', 'gitmcp'])
    expect(result.imported).toEqual([])
    expect(result.skipped[0].reason.toLowerCase()).toContain('mcp')
  })

  it('tolerates VS Code settings with comments and trailing commas', async () => {
    const source = path.join(dir, 'settings.json')
    await writeFile(source, '{\n  // editor stuff\n  "cline.mcpServers": { "only": {} },\n}')

    const result = importClineSettings({ source })

    expect(result.mcpServers).toEqual(['only'])
  })
})
