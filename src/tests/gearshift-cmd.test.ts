/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/gearshift-cmd.ts — gearshiftCommand factory wiring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { gearshiftCommand } from '../cli/commands/gearshift-cmd.js'

function captureStdout(): { out: string[]; restore: () => void } {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  return { out, restore: () => spy.mockRestore() }
}

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('gearshiftCommand', () => {
  let dir: string
  let fakeHome: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-gearshift-'))
    const store = SqliteStore.open(dir)
    store.initProject('gearshift-test')
    store.close()

    // Never let setGear() touch the real ~/.claude/settings.json in tests.
    fakeHome = mkdtempSync(join(tmpdir(), 'agf-gearshift-home-'))
    process.env.AGF_CLAUDE_HOME = fakeHome
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(fakeHome, { recursive: true, force: true })
    delete process.env.AGF_CLAUDE_HOME
    vi.restoreAllMocks()
  })

  it('builds the "gearshift" command with 5 subcommands', () => {
    const cmd = gearshiftCommand()
    expect(cmd.name()).toBe('gearshift')
    expect(cmd.commands.length).toBe(5)
  })

  it('GIVEN a fresh store WHEN status runs THEN {auto:true, gear:2, model, effort, tier}', async () => {
    const { out, restore } = captureStdout()
    await gearshiftCommand().parseAsync(['status', '-d', dir], { from: 'user' })
    restore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as Record<string, unknown>
    expect(data.auto).toBe(true)
    expect(data.gear).toBe(2)
    expect(data.tier).toBe('build')
    expect(data.model).toBe('claude-sonnet-4-6')
    expect(typeof data.effort).toBe('string')
  })

  it('GIVEN gearshift set 3 THEN settings.json reflects sonnet[1m] and emits a /model hint', async () => {
    const { out, restore } = captureStdout()
    await gearshiftCommand().parseAsync(['set', '3', '-d', dir], { from: 'user' })
    restore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as Record<string, unknown>
    expect(data.gear).toBe(3)
    expect(data.hint).toContain('/model sonnet[1m]')
  })

  it('GIVEN gearshift auto off THEN manual mode is active and set 2 overrides', async () => {
    const off = captureStdout()
    await gearshiftCommand().parseAsync(['auto', 'off', '-d', dir], { from: 'user' })
    off.restore()
    const offEnvelope = lastEnvelope(off.out)
    expect((offEnvelope.data as Record<string, unknown>).auto).toBe(false)

    const setOut = captureStdout()
    await gearshiftCommand().parseAsync(['set', '2', '-d', dir], { from: 'user' })
    setOut.restore()
    expect((lastEnvelope(setOut.out).data as Record<string, unknown>).gear).toBe(2)

    const statusOut = captureStdout()
    await gearshiftCommand().parseAsync(['status', '-d', dir], { from: 'user' })
    statusOut.restore()
    const status = lastEnvelope(statusOut.out).data as Record<string, unknown>
    expect(status.auto).toBe(false)
    expect(status.gear).toBe(2)
  })

  it('GIVEN gear=2 WHEN up runs THEN gear=3; GIVEN gear=3 WHEN down runs THEN gear=2', async () => {
    const upOut = captureStdout()
    await gearshiftCommand().parseAsync(['up', '-d', dir], { from: 'user' })
    upOut.restore()
    expect((lastEnvelope(upOut.out).data as Record<string, unknown>).gear).toBe(3)

    const downOut = captureStdout()
    await gearshiftCommand().parseAsync(['down', '-d', dir], { from: 'user' })
    downOut.restore()
    expect((lastEnvelope(downOut.out).data as Record<string, unknown>).gear).toBe(2)
  })

  it('rejects an out-of-range gear with INVALID_GEAR', async () => {
    const { out, restore } = captureStdout()
    await gearshiftCommand().parseAsync(['set', '9', '-d', dir], { from: 'user' })
    restore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('INVALID_GEAR')
  })
})
