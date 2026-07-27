/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_wire_a6ad395cbf82 — wire the dormant collectGitContext/
 * formatGitContextXml (src/core/utils/git-context.ts, zero consumers) into
 * `agf context git`, so an agent can pull compact git state (branch, dirty
 * files, recent commits) the same way it already pulls task context.
 */

import { describe, it, expect, vi } from 'vitest'
import { contextCommand } from '../cli/commands/context-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runContext(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await contextCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf context git', () => {
  it('returns branch/dirtyFiles/recentCommits as structured JSON by default', async () => {
    const envelope = await runContext(['git'])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { branch: string | null; dirtyFiles: string[]; recentCommits: unknown[] }
    expect(typeof data.branch === 'string' || data.branch === null).toBe(true)
    expect(Array.isArray(data.dirtyFiles)).toBe(true)
    expect(Array.isArray(data.recentCommits)).toBe(true)
  })

  it('returns the LLM-readable XML block when --format xml is passed', async () => {
    const envelope = await runContext(['git', '--format', 'xml'])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { xml: string }
    expect(data.xml).toContain('<git-context>')
    expect(data.xml).toContain('</git-context>')
  })
})
