/*!
 * Tests for `agf hooks add` — writes a hook entry to .mcp-graph/hooks.json
 * AC:
 *   - Valid channel+command writes to project config; hooks list reflects it
 *   - Invalid channel errors with valid channels list
 *   - --emit <cli> returns native snippet
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  addHookEntry,
  type AddHookOptions,
  validateHookChannel,
  mergeImportedHooksIntoConfig,
} from '../cli/commands/hooks-add.js'
import type { HookHandlerConfig } from '../core/hooks/config-loader.js'

const TMP = join(tmpdir(), 'hooks-add-test-' + Math.random().toString(36).slice(2))

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

describe('validateHookChannel', () => {
  it('accepts a valid channel', () => {
    expect(() => validateHookChannel('tool:pre-call')).not.toThrow()
  })

  it('rejects an invalid channel with message listing valid channels', () => {
    expect(() => validateHookChannel('invalid:channel')).toThrow(/valid channels/i)
  })
})

describe('addHookEntry', () => {
  it('creates hooks.json and writes an entry for a valid channel', () => {
    const opts: AddHookOptions = {
      channel: 'tool:pre-call',
      command: 'echo hello',
      dir: TMP,
      scope: 'project',
    }
    const result = addHookEntry(opts)
    expect(result.written).toBe(true)

    const configPath = join(TMP, '.mcp-graph', 'hooks.json')
    expect(existsSync(configPath)).toBe(true)

    const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(raw.version).toBe(1)
    const entries = raw.hooks['tool:pre-call']
    expect(Array.isArray(entries)).toBe(true)
    expect(entries[0].command).toBe('echo hello')
    expect(entries[0].channel).toBe('tool:pre-call')
    expect(entries[0].kind).toBe('shell')
  })

  it('appends to an existing entry list without overwriting', () => {
    const opts: AddHookOptions = { channel: 'tool:pre-call', command: 'echo first', dir: TMP, scope: 'project' }
    addHookEntry(opts)
    addHookEntry({ ...opts, command: 'echo second' })

    const configPath = join(TMP, '.mcp-graph', 'hooks.json')
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
    const entries = raw.hooks['tool:pre-call']
    expect(entries.length).toBe(2)
    expect(entries[1].command).toBe('echo second')
  })

  it('throws on invalid channel before writing any file', () => {
    const opts: AddHookOptions = { channel: 'bad:channel', command: 'echo x', dir: TMP, scope: 'project' }
    expect(() => addHookEntry(opts)).toThrow(/valid channels/i)
    expect(existsSync(join(TMP, '.mcp-graph', 'hooks.json'))).toBe(false)
  })

  it('returns emit snippet for a supported CLI format', () => {
    const opts: AddHookOptions = {
      channel: 'tool:pre-call',
      command: 'echo hello',
      dir: TMP,
      scope: 'project',
      emit: 'codex',
    }
    const result = addHookEntry(opts)
    expect(result.written).toBe(true)
    expect(result.nativeSnippet).toBeDefined()
    expect(typeof result.nativeSnippet).toBe('string')
  })
})

describe('mergeImportedHooksIntoConfig (node_wire_4d0a650e1d68)', () => {
  it('groups entries by channel and writes them additively', () => {
    const entries: HookHandlerConfig[] = [
      {
        id: 'claude-pretooluse-0-0',
        channel: 'tool:pre-call',
        kind: 'shell',
        command: '/bin/sh',
        commandArgs: ['-c', 'echo pre'],
        priority: 0,
        enabled: true,
      },
      {
        id: 'claude-sessionend-0-0',
        channel: 'session:end',
        kind: 'shell',
        command: '/bin/sh',
        commandArgs: ['-c', 'echo end'],
        priority: 0,
        enabled: true,
      },
    ]

    const result = mergeImportedHooksIntoConfig({ entries, dir: TMP, scope: 'project' })
    expect(result.written).toBe(true)
    expect(result.addedCount).toBe(2)

    const configPath = join(TMP, '.mcp-graph', 'hooks.json')
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(raw.hooks['tool:pre-call'][0].id).toBe('claude-pretooluse-0-0')
    expect(raw.hooks['session:end'][0].id).toBe('claude-sessionend-0-0')
  })

  it('does not overwrite hooks added manually before the import', () => {
    addHookEntry({ channel: 'tool:pre-call', command: 'echo manual', dir: TMP, scope: 'project' })

    const entries: HookHandlerConfig[] = [
      {
        id: 'claude-pretooluse-0-0',
        channel: 'tool:pre-call',
        kind: 'shell',
        command: '/bin/sh',
        commandArgs: ['-c', 'echo imported'],
        priority: 0,
        enabled: true,
      },
    ]
    mergeImportedHooksIntoConfig({ entries, dir: TMP, scope: 'project' })

    const configPath = join(TMP, '.mcp-graph', 'hooks.json')
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(raw.hooks['tool:pre-call'].length).toBe(2)
    expect(raw.hooks['tool:pre-call'][0].command).toBe('echo manual')
    expect(raw.hooks['tool:pre-call'][1].id).toBe('claude-pretooluse-0-0')
  })
})
