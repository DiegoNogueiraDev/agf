/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/audit-cmd.ts — wires audit-query.ts (queryAuditLog/
 * formatAuditEntry) into the CLI surface, sourced from ToolCallLog.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditCommand, toAuditEntry } from '../cli/commands/audit-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { ToolCallLog } from '../core/store/tool-call-log.js'
import { ToolTokenStore } from '../core/store/tool-token-store.js'

describe('auditCommand', () => {
  it('builds the "audit" command with a description', () => {
    const cmd = auditCommand()
    expect(cmd.name()).toBe('audit')
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('registers a redact subcommand', () => {
    const cmd = auditCommand()
    const redact = cmd.commands.find((c) => c.name() === 'redact')
    expect(redact).toBeDefined()
  })
})

describe('auditCommand redact — end to end', () => {
  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await auditCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('redacts a sk-ant- token from plain text input', async () => {
    const result = await run(['redact', 'my key is sk-ant-abcdefghijklmnopqrstu123'])
    expect(result.ok).toBe(true)
    const data = result.data as { redacted: unknown }
    expect(data.redacted).toContain('sk-ant-...')
    expect(data.redacted).not.toContain('sk-ant-abcdefghijklmnopqrstu123')
  })

  it('redacts secret fields from JSON input', async () => {
    const result = await run(['redact', '{"token":"super-secret","name":"ok"}'])
    expect(result.ok).toBe(true)
    const data = result.data as { redacted: { token: unknown; name: unknown } }
    expect(data.redacted.token).not.toBe('super-secret')
    expect(data.redacted.name).toBe('ok')
  })
})

describe('toAuditEntry', () => {
  it('maps a ToolCallEntry to the audit-query AuditEntry shape, status always success', () => {
    const entry = toAuditEntry({
      id: 1,
      projectId: 'proj_1',
      nodeId: 'node_1',
      toolName: 'ReadTool',
      toolArgs: '{"path":"x.ts"}',
      calledAt: '2026-01-15T10:00:00.000Z',
    })
    expect(entry).toEqual({
      timestamp: '2026-01-15T10:00:00.000Z',
      nodeId: 'node_1',
      tool: 'ReadTool',
      status: 'success',
      message: '{"path":"x.ts"}',
    })
  })

  it('falls back to "(project)" for a null nodeId and empty string for null toolArgs', () => {
    const entry = toAuditEntry({
      id: 2,
      projectId: 'proj_1',
      nodeId: null,
      toolName: 'search',
      toolArgs: null,
      calledAt: '2026-01-15T10:00:00.000Z',
    })
    expect(entry.nodeId).toBe('(project)')
    expect(entry.message).toBe('')
  })
})

describe('auditCommand — end to end', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await auditCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('returns formatted, filtered entries recorded via ToolCallLog', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-audit-cmd-'))
    const store = SqliteStore.open(dir)
    const project = store.initProject('audit-cmd-test')
    const log = new ToolCallLog(store.getDb())
    log.record(project.id, 'node_1', 'ReadTool', 'a.ts')
    log.record(project.id, 'node_2', 'WriteTool', 'b.ts')
    store.close()

    const result = await run(['-d', dir, '--tool', 'ReadTool'])
    expect(result.ok).toBe(true)
    const data = result.data as { entries: unknown[]; formatted: string[] }
    expect(data.entries).toHaveLength(1)
    expect(data.formatted[0]).toContain('ReadTool')
    expect(data.formatted[0]).toContain('node_1')
  })

  it('returns empty results when no project exists yet', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-audit-cmd-noproj-'))
    const store = SqliteStore.open(dir)
    store.close()

    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { entries: unknown[] }).entries).toEqual([])
  })
})

describe('auditCommand tool-usage — end to end', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await auditCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('surfaces per-tool usage stats recorded via ToolTokenStore (deprecation gate evidence)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-audit-tool-usage-'))
    const store = SqliteStore.open(dir)
    const project = store.initProject('audit-tool-usage-test')
    const tokenStore = new ToolTokenStore(store.getDb())
    tokenStore.recordCall(project.id, 'ReadTool', { inputTokens: 100, outputTokens: 20, success: true, durationMs: 50 })
    tokenStore.recordCall(project.id, 'ReadTool', {
      inputTokens: 80,
      outputTokens: 10,
      success: false,
      durationMs: 70,
      errorKind: 'timeout',
    })
    store.close()

    const result = await run(['tool-usage', '-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { stats: Array<{ toolName: string; callCount: number }> }
    expect(data.stats).toHaveLength(1)
    expect(data.stats[0].toolName).toBe('ReadTool')
    expect(data.stats[0].callCount).toBe(2)
  })

  it('returns empty stats when no project exists yet', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-audit-tool-usage-noproj-'))
    const store = SqliteStore.open(dir)
    store.close()

    const result = await run(['tool-usage', '-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { stats: unknown[] }).stats).toEqual([])
  })
})
