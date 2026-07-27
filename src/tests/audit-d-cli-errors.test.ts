/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * AUDIT-029/030/031/032/033 — command-level wiring: malformed CLI input now
 * yields an `{ ok:false }` envelope (correct code) instead of a raw throw.
 * Only the pre-store error branches are exercised here (no graph DB needed).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importGraphCommand } from '../cli/commands/import-graph-cmd.js'
import { snapshotCommand } from '../cli/commands/snapshot-cmd.js'
import { memoryCommand } from '../cli/commands/memory-cmd.js'
import { nodeCommand } from '../cli/commands/node-cmd.js'
import { specCommand } from '../cli/commands/spec-cmd.js'
import { setSelect, setProfile, setPretty } from '../core/output/writer.js'

let buf = ''
let spy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  buf = ''
  setSelect(null)
  setProfile(undefined)
  setPretty(false)
  process.exitCode = 0
  spy = vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => {
    buf += String(s)
    return true
  })
})

afterEach(() => {
  spy.mockRestore()
  process.exitCode = 0
})

function lastEnvelope(): Record<string, unknown> {
  const lines = buf.trim().split('\n').filter(Boolean)
  return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>
}

describe('import-graph error envelopes (AUDIT-029)', () => {
  it('FILE_READ_ERROR for a missing file', async () => {
    await importGraphCommand().parseAsync(['/no/such/file-xyz.json'], { from: 'user' })
    const env = lastEnvelope()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('FILE_READ_ERROR')
  })

  it('PARSE_ERROR for invalid JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-d-'))
    const f = join(dir, 'bad.json')
    writeFileSync(f, '{ not json', 'utf-8')
    try {
      await importGraphCommand().parseAsync([f], { from: 'user' })
      const env = lastEnvelope()
      expect(env.ok).toBe(false)
      expect(env.code).toBe('PARSE_ERROR')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('INVALID_GRAPH for well-formed JSON that is not a GraphDocument', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-d-'))
    const f = join(dir, 'wrong.json')
    writeFileSync(f, JSON.stringify({ foo: 1 }), 'utf-8')
    try {
      await importGraphCommand().parseAsync([f], { from: 'user' })
      const env = lastEnvelope()
      expect(env.ok).toBe(false)
      expect(env.code).toBe('INVALID_GRAPH')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('snapshot restore invalid id (AUDIT-030)', () => {
  it('NOT_FOUND for a non-numeric id (no raw datatype-mismatch)', async () => {
    await snapshotCommand().parseAsync(['restore', 'abc'], { from: 'user' })
    const env = lastEnvelope()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_FOUND')
  })
})

describe('memory write blank name (AUDIT-031)', () => {
  it('INVALID_INPUT for a whitespace-only name', async () => {
    await memoryCommand().parseAsync(['write', '   ', '--content', 'x'], { from: 'user' })
    const env = lastEnvelope()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_INPUT')
  })
})

describe('node add invalid priority (AUDIT-032)', () => {
  it('INVALID_INPUT for a priority outside 1–5', async () => {
    await nodeCommand().parseAsync(['add', '--title', 'T', '--priority', '9'], { from: 'user' })
    const env = lastEnvelope()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_INPUT')
  })
  it('INVALID_INPUT for a non-numeric priority', async () => {
    await nodeCommand().parseAsync(['add', '--title', 'T', '--priority', 'high'], { from: 'user' })
    const env = lastEnvelope()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_INPUT')
  })
})

describe('spec generate unwritable out (AUDIT-033)', () => {
  it('WRITE_FAILED when the destination directory does not exist', async () => {
    await specCommand().parseAsync(['--generate', 'prd-template', '--out', '/no/such/dir/spec.md'], { from: 'user' })
    const env = lastEnvelope()
    expect(env.ok).toBe(false)
    expect(env.code).toBe('WRITE_FAILED')
  })
})
