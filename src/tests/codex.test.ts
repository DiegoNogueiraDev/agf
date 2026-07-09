/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/providers/codex.ts — importCodexSettings + codexAliases.
 * Codex stores bare-string hook commands under [hooks] in ~/.codex/config.toml,
 * including the dotted inspect.prompt / inspect.tool_call forms.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { importCodexSettings, codexAliases } from '../core/hooks/providers/codex.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'codex-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('codexAliases', () => {
  it('maps codex events to mcp-graph channels', () => {
    expect(codexAliases.notify).toBe('task:post-complete')
    expect(codexAliases['inspect.prompt']).toBe('task:pre-execute')
    expect(codexAliases['inspect.tool_call']).toBe('tool:pre-call')
  })
})

describe('importCodexSettings', () => {
  it('skips with a not-found reason when the config is missing', () => {
    const result = importCodexSettings({ source: path.join(dir, 'nope.toml') })

    expect(result.provider).toBe('codex')
    expect(result.imported).toEqual([])
    expect(result.skipped[0].reason).toContain('source not found')
  })

  it('imports flat and dotted hook entries as shell handlers on mapped channels', async () => {
    const source = path.join(dir, 'config.toml')
    await writeFile(source, ['[hooks]', 'notify = "/x/notify.sh"', 'inspect.prompt = "/x/prompt.sh"'].join('\n'))

    const result = importCodexSettings({ source })

    expect(result.provider).toBe('codex')
    expect(result.imported.length).toBeGreaterThanOrEqual(2)
    const channels = result.imported.map((h) => h.channel)
    expect(channels).toContain('task:post-complete')
    expect(channels).toContain('task:pre-execute')
    const notify = result.imported.find((h) => h.channel === 'task:post-complete')
    expect(notify?.kind).toBe('shell')
    expect(notify?.commandArgs).toContain('/x/notify.sh')
  })

  it('imports nothing from a config that has no [hooks] section', async () => {
    const source = path.join(dir, 'no-hooks.toml')
    await writeFile(source, ['[model]', 'name = "gpt-5"'].join('\n'))

    const result = importCodexSettings({ source })

    expect(result.provider).toBe('codex')
    expect(result.imported).toEqual([])
  })
})
