/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/ubiquitous-language-cmd.ts — wires
 * ubiquitous-language.ts (node_wire_b5fa971d873d), which had zero real
 * callers despite being a complete, tested, pure parse/merge/render pipeline.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ubiquitousLanguageCommand } from '../cli/commands/ubiquitous-language-cmd.js'

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
    await ubiquitousLanguageCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf ubiquitous-language (node_wire_b5fa971d873d)', () => {
  let dir: string
  let file: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('add creates the file with the Vocabulário Canonical section when absent', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-vocab-'))
    file = join(dir, 'CONTEXT.md')

    const added = await run(['add', 'Shard', 'A section-aligned partition of a PRD', '--file', file])
    expect(added.ok).toBe(true)
    expect((added.data as { terms: Array<{ term: string }> }).terms).toHaveLength(1)

    const content = readFileSync(file, 'utf-8')
    expect(content).toContain('## Vocabulário Canonical')
    expect(content).toContain('### Shard')
  })

  it('add merges into an existing doc without clobbering surrounding content', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-vocab-merge-'))
    file = join(dir, 'CONTEXT.md')
    writeFileSync(file, '# Project\n\nIntro text.\n\n## Other Section\n\nUnrelated.\n')

    await run(['add', 'Peer', 'A federated project this project learns from', '--file', file])
    const content = readFileSync(file, 'utf-8')
    expect(content).toContain('Intro text.')
    expect(content).toContain('## Other Section')
    expect(content).toContain('### Peer')
  })

  it('add with --avoid renders the anti-pattern note, list surfaces it back', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-vocab-avoid-'))
    file = join(dir, 'CONTEXT.md')

    await run(['add', 'Task', 'An atomic unit of work', '--avoid', "Don't call it a ticket", '--file', file])
    const listed = await run(['list', '--file', file])
    const terms = (listed.data as { terms: Array<{ term: string; avoid?: string }> }).terms
    expect(terms[0].avoid).toBe("Don't call it a ticket")
  })

  it('add rejects a conflicting redefinition of the same term', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-vocab-conflict-'))
    file = join(dir, 'CONTEXT.md')

    await run(['add', 'Epic', 'A large body of work', '--file', file])
    const conflict = await run(['add', 'Epic', 'A completely different meaning', '--file', file])
    expect(conflict.ok).toBe(false)
    expect(conflict.code).toBe('CONFLICT')
  })

  it('list returns an empty array for a file with no vocab section', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-vocab-empty-'))
    file = join(dir, 'CONTEXT.md')

    const listed = await run(['list', '--file', file])
    expect((listed.data as { terms: unknown[] }).terms).toEqual([])
  })
})
