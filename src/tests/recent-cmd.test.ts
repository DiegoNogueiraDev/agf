/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/recent-cmd.ts — wires StoreManager's recent-folders
 * tracking (previously dormant, no-surface) into the CLI as `agf recent`.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recentCommand } from '../cli/commands/recent-cmd.js'
import { StoreManager } from '../core/store/store-manager.js'

describe('recentCommand', () => {
  it('builds the "recent" command with a description', () => {
    const cmd = recentCommand()
    expect(cmd.name()).toBe('recent')
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('declares a --dir option', () => {
    const cmd = recentCommand()
    expect(cmd.options.some((o) => o.long === '--dir')).toBe(true)
  })
})

describe('recentCommand — end to end', () => {
  let dir: string
  let swapTarget: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(swapTarget, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await recentCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('lists a folder swapped into recently-used history', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-recent-'))
    swapTarget = mkdtempSync(join(tmpdir(), 'agf-recent-target-'))
    mkdirSync(join(dir, 'workflow-graph'), { recursive: true })

    const targetMgr = StoreManager.create(swapTarget)
    targetMgr.store.initProject('Swap Target')
    targetMgr.close()

    const manager = StoreManager.create(dir)
    manager.store.initProject('Origin')
    manager.swap(swapTarget)
    manager.close()

    const result = await run(['--dir', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { folders: string[] }
    expect(data.folders).toContain(swapTarget)
  })
})
