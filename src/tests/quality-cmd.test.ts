/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/quality-cmd.ts — qualityCommand factory wiring.
 */

import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { qualityCommand } from '../cli/commands/quality-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('qualityCommand', () => {
  it('builds the "quality" command with a description', () => {
    const cmd = qualityCommand()
    expect(cmd.name()).toBe('quality')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = qualityCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf quality --snapshot persists and trends the weekly quality snapshot (node_wire_054d3593fe6d)', () => {
  it('reports no previous snapshot on the first run, then a delta on the second', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-quality-snapshot-'))
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(join(dir, 'src/core/util.ts'), 'export function util(s: string): string { return s.trim() }\n')

      const store = SqliteStore.open(dir)
      store.initProject('quality-snapshot-test')
      store.close()

      async function runQuality(): Promise<Record<string, unknown>> {
        const out: string[] = []
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
          out.push(String(chunk))
          return true
        })
        try {
          await qualityCommand().parseAsync(['--snapshot', '-d', dir], { from: 'user' })
        } finally {
          spy.mockRestore()
        }
        return lastEnvelope(out)
      }

      const first = await runQuality()
      const firstData = first.data as { previous: unknown; severity: string }
      expect(first.ok).toBe(true)
      expect(firstData.previous).toBeNull()
      expect(firstData.severity).toBe('stable')

      const second = await runQuality()
      const secondData = second.data as { previous: unknown; harnessDelta: number | null }
      expect(secondData.previous).not.toBeNull()
      expect(typeof secondData.harnessDelta).toBe('number')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
