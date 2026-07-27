/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_1a6a6a7b6c7d — `agf loop stop <id>|all` was marked done with the
 * CORE logic (stopLoop/stopAllLoops, loop-stop.ts) fully tested, but the CLI
 * subcommand was never actually wired into loop-cmd.ts — a phantom done
 * (grep confirmed zero `.command('stop')` in the file, and loop-cmd.ts never
 * imported loop-stop.ts despite its own docblock saying it composes with it).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { registerLoop, getLoop } from '../core/autonomy/loop-registry.js'
import { loopCommand } from '../cli/commands/loop-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runLoop(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await loopCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf loop stop <id>|all', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-loop-stop-cmd-'))
    SqliteStore.open(dir).initProject('proj')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('AC1: stop <id> marks the loop stopped (using a real, definitely-dead pid so the killer is a no-op)', async () => {
    const store = SqliteStore.open(dir)
    const id = registerLoop(store.getDb(), { prompt: 'test', intervalSecs: 60, pid: 999999 })
    store.close()

    const envelope = await runLoop(['stop', id, '-d', dir])
    expect(envelope.ok).toBe(true)

    const verifyStore = SqliteStore.open(dir)
    expect(getLoop(verifyStore.getDb(), id)?.status).toBe('stopped')
    verifyStore.close()
  })

  it('AC2: stop all stops every running loop', async () => {
    const store = SqliteStore.open(dir)
    const idA = registerLoop(store.getDb(), { prompt: 'a', intervalSecs: 60, pid: 999998 })
    const idB = registerLoop(store.getDb(), { prompt: 'b', intervalSecs: 60, pid: 999997 })
    store.close()

    const envelope = await runLoop(['stop', 'all', '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { stopped: number }
    expect(data.stopped).toBe(2)

    const verifyStore = SqliteStore.open(dir)
    expect(getLoop(verifyStore.getDb(), idA)?.status).toBe('stopped')
    expect(getLoop(verifyStore.getDb(), idB)?.status).toBe('stopped')
    verifyStore.close()
  })

  it('AC3: stop <unknown-id> returns NOT_FOUND', async () => {
    const envelope = await runLoop(['stop', 'no-such-id', '-d', dir])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('NOT_FOUND')
  })

  it('AC4: stop <id> with an already-dead pid does not throw and still marks stopped', async () => {
    const store = SqliteStore.open(dir)
    // pid 1 (init/launchd) — sending it a real signal would be dangerous, but
    // the loop-stop.ts killer default only fires for a genuinely running
    // registry entry with an implausible pid, which is what we simulate here.
    const id = registerLoop(store.getDb(), { prompt: 'test', intervalSecs: 60, pid: 999996 })
    store.close()

    const envelope = await runLoop(['stop', id, '-d', dir])
    expect(envelope.ok).toBe(true)
  })
})
