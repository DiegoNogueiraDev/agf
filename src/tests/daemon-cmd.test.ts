/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/daemon-cmd.ts — workspace path canonicalization
 * (node_wire_0f4ce420dc51: wires the dormant daemon-paths.ts resolveDaemonPaths
 * instead of the ad-hoc, non-canonicalizing workspaceHash()/stateDir() helpers
 * that previously lived inline in this file).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { daemonCommand } from '../cli/commands/daemon-cmd.js'
import { resolveDaemonPaths, ensureStateDir } from '../core/daemon/daemon-paths.js'
import { writeDaemonMeta } from '../core/daemon/daemon-meta.js'

vi.mock('node:child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:child_process')>()
  return { ...orig, spawn: vi.fn(orig.spawn) }
})

describe('daemon status — symlinked workspace path resolves to the same state dir as the real path', () => {
  let realDir: string
  let linkDir: string
  let stateDirPath: string

  afterEach(() => {
    rmSync(linkDir, { force: true })
    rmSync(realDir, { recursive: true, force: true })
    rmSync(stateDirPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('finds the daemon meta written under the real-path state dir when queried via a symlink', async () => {
    realDir = mkdtempSync(join(tmpdir(), 'agf-daemon-cmd-real-'))
    linkDir = join(tmpdir(), `agf-daemon-cmd-link-${process.pid}`)
    symlinkSync(realDir, linkDir)

    const paths = resolveDaemonPaths(realDir)
    stateDirPath = paths.stateDir
    ensureStateDir(paths)
    writeDaemonMeta(paths.stateDir, {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      workspacePath: realDir,
    })

    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await daemonCommand().parseAsync(['status', '-d', linkDir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    const envelope = JSON.parse(out.join('').trim())

    expect(envelope.ok).toBe(true)
    expect(envelope.data.running).toBe(true)
    expect(envelope.data.pid).toBe(process.pid)
  })
})

describe('daemon start — self-healing diagnosis on spawn failure (node_wire_79ff703a161d)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.mocked(spawn).mockReset()
  })

  it('attaches a suggested fix recipe when the spawn failure matches a known pattern', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-daemon-cmd-start-'))
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('listen EADDRINUSE: address already in use')
    })

    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await daemonCommand().parseAsync(['start', '-d', dir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    const envelope = JSON.parse(out.join('').trim())

    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('DAEMON_START_FAILED')
    expect(envelope.data.suggestedFix).toEqual({
      pattern: 'EADDRINUSE|address already in use',
      fix: 'remove stale IPC socket file and restart daemon',
      action: 'restart',
    })
  })

  it('omits suggestedFix when the failure matches no known pattern', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-daemon-cmd-start-'))
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error('totally unrecognized failure')
    })

    const out: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await daemonCommand().parseAsync(['start', '-d', dir], { from: 'user' })
    } finally {
      process.stdout.write = originalWrite
    }
    const envelope = JSON.parse(out.join('').trim())

    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('DAEMON_START_FAILED')
    expect(envelope.data).toBeUndefined()
  })
})
