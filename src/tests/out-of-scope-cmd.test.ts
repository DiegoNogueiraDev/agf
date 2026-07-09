/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/out-of-scope-cmd.ts — wires out-of-scope-store.ts
 * (node_wire_2f735d5d9c1f), which had zero real callers despite being a
 * complete, tested, pure-I/O module.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { outOfScopeCommand } from '../cli/commands/out-of-scope-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await outOfScopeCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf out-of-scope (node_wire_2f735d5d9c1f)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('record → list roundtrips a real .out-of-scope/*.md entry', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-oos-'))

    const recorded = await run(['record', 'GraphQL API layer', 'REST is sufficient for our scale', '--dir', dir])
    expect(recorded.ok).toBe(true)
    expect((recorded.data as { slug: string }).slug).toBe('graphql-api-layer')

    const listed = await run(['list', '--dir', dir])
    const entries = (listed.data as { entries: Array<{ concept: string; reason: string }> }).entries
    expect(entries).toHaveLength(1)
    expect(entries[0].concept).toBe('GraphQL API layer')
    expect(entries[0].reason).toBe('REST is sufficient for our scale')
  })

  it('check surfaces a token-overlap match for a re-proposed concept', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-oos-check-'))
    await run([
      'record',
      'GraphQL API layer for the dashboard',
      'REST already covers every real use case',
      '--dir',
      dir,
    ])

    const checked = await run(['check', 'add a GraphQL layer to the dashboard API', '--dir', dir, '--threshold', '0.3'])
    expect(checked.ok).toBe(true)
    const matches = (checked.data as { matches: Array<{ concept: string; similarity: number }> }).matches
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].similarity).toBeGreaterThan(0)
  })

  it('check returns no matches for an unrelated concept', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-oos-nomatch-'))
    await run(['record', 'Blockchain integration', 'No real user demand', '--dir', dir])

    const checked = await run(['check', 'improve error message formatting', '--dir', dir])
    expect((checked.data as { matches: unknown[] }).matches).toHaveLength(0)
  })
})
