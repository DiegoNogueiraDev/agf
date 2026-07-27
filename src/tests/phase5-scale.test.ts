/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Fase 5 tests — /audit, Daemon Self-Healing, /repl.
 */
import { describe, it, expect } from 'vitest'
import { queryAuditLog, formatAuditEntry, type AuditFilter } from '../core/observability/audit-query.js'
import { DaemonSelfHealer, type DaemonFailure } from '../core/daemon/daemon-self-healing.js'
import { ReplSession } from '../tui/repl-session.js'

// ---------------------------------------------------------------------------
// /audit
// ---------------------------------------------------------------------------

describe('audit: queryAuditLog', () => {
  const entries = [
    { timestamp: '2026-01-01T10:00:00Z', nodeId: 'n1', tool: 'bash', status: 'success', message: 'npm test' },
    { timestamp: '2026-01-01T10:01:00Z', nodeId: 'n1', tool: 'write', status: 'success', message: 'wrote file' },
    { timestamp: '2026-01-02T10:00:00Z', nodeId: 'n2', tool: 'bash', status: 'error', message: 'rm denied' },
  ]

  it('filters by nodeId', () => {
    const r = queryAuditLog(entries, { nodeId: 'n1' })
    expect(r.length).toBe(2)
    expect(r.every((e) => e.nodeId === 'n1')).toBe(true)
  })

  it('filters by tool', () => {
    const r = queryAuditLog(entries, { tool: 'bash' })
    expect(r.length).toBe(2)
  })

  it('filters by status', () => {
    const r = queryAuditLog(entries, { status: 'error' })
    expect(r.length).toBe(1)
    expect(r[0].message).toBe('rm denied')
  })

  it('returns all without filter', () => {
    expect(queryAuditLog(entries, {}).length).toBe(3)
  })

  it('formatAuditEntry returns structured output', () => {
    const out = formatAuditEntry(entries[0])
    expect(out).toContain('n1')
    expect(out).toContain('bash')
    expect(out).toContain('success')
  })
})

// ---------------------------------------------------------------------------
// Daemon Self-Healing
// ---------------------------------------------------------------------------

describe('DaemonSelfHealer', () => {
  it('diagnoses stale IPC file failure', () => {
    const healer = new DaemonSelfHealer()
    const failure: DaemonFailure = {
      message: 'EADDRINUSE: address already in use /tmp/agf-daemon.sock',
      exitCode: 1,
    }
    const recipe = healer.diagnose(failure)
    expect(recipe).not.toBeNull()
    expect(recipe!.fix).toContain('remove stale IPC')
  })

  it('diagnoses dist not found failure', () => {
    const healer = new DaemonSelfHealer()
    const failure: DaemonFailure = {
      message: "Cannot find module './dist/cli/index.js'",
      exitCode: 1,
    }
    const recipe = healer.diagnose(failure)
    expect(recipe).not.toBeNull()
    expect(recipe!.fix).toContain('rebuild')
  })

  it('diagnoses proxy connection failure', () => {
    const healer = new DaemonSelfHealer()
    const failure: DaemonFailure = {
      message: 'ECONNREFUSED: proxy connection failed',
      exitCode: 1,
    }
    const recipe = healer.diagnose(failure)
    expect(recipe).not.toBeNull()
    expect(recipe!.fix).toContain('proxy')
  })

  it('returns null for unknown failures', () => {
    const healer = new DaemonSelfHealer()
    const failure: DaemonFailure = {
      message: 'completely unknown error',
      exitCode: 99,
    }
    expect(healer.diagnose(failure)).toBeNull()
  })

  it('tracks successful diagnoses for learning', () => {
    const healer = new DaemonSelfHealer()
    const failure: DaemonFailure = { message: 'EADDRINUSE', exitCode: 1 }
    const recipe = healer.diagnose(failure)!
    healer.recordSuccess(recipe)
    expect(healer.getLearnedFixes().length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// /repl
// ---------------------------------------------------------------------------

describe('ReplSession', () => {
  it('starts with empty history', () => {
    const repl = new ReplSession()
    expect(repl.getHistory().length).toBe(0)
  })

  it('records commands in history', () => {
    const repl = new ReplSession()
    repl.addToHistory('/stats')
    repl.addToHistory('/next')
    expect(repl.getHistory()).toEqual(['/stats', '/next'])
  })

  it('caps history at max size', () => {
    const repl = new ReplSession(3)
    repl.addToHistory('1')
    repl.addToHistory('2')
    repl.addToHistory('3')
    repl.addToHistory('4')
    expect(repl.getHistory()).toEqual(['2', '3', '4'])
  })

  it('clear empties history', () => {
    const repl = new ReplSession()
    repl.addToHistory('test')
    repl.clear()
    expect(repl.getHistory().length).toBe(0)
  })

  it('tracks prompt prefix', () => {
    const repl = new ReplSession()
    expect(repl.prompt).toBe('›› ')
    repl.setPrompt('repl> ')
    expect(repl.prompt).toBe('repl> ')
  })
})
