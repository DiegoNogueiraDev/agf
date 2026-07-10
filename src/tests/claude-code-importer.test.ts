/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/claude-code-importer.ts — importClaudeCodeSettings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { importClaudeCodeSettings } from '../core/hooks/claude-code-importer.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'cc-importer-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('importClaudeCodeSettings', () => {
  it('skips with a not-found reason when settings.json is missing', () => {
    const result = importClaudeCodeSettings({ source: path.join(dir, 'settings.json') })
    expect(result.provider).toBe('claude')
    expect(result.imported).toEqual([])
    expect(result.skipped[0].reason).toContain('source not found')
  })

  it('imports a command hook block as a shell handler', async () => {
    const source = path.join(dir, 'settings.json')
    await writeFile(
      source,
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }],
        },
      }),
    )

    const result = importClaudeCodeSettings({ source })

    expect(result.provider).toBe('claude')
    expect(result.imported.length).toBeGreaterThanOrEqual(1)
    const handler = result.imported[0]
    expect(handler.kind).toBe('shell')
    expect(handler.commandArgs).toContain('echo hi')
  })

  it('skips non-command hook entries', async () => {
    const source = path.join(dir, 'settings.json')
    await writeFile(source, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'notcommand' }] }] } }))

    const result = importClaudeCodeSettings({ source })
    expect(result.imported).toEqual([])
  })
})
