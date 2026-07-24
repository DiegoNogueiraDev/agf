/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_b5c2893f6905 — wire the dormant, read-only detectStack
 * (sandbox/stack-detector.ts) into a real CLI surface. Scoped narrowly to
 * the SAFE slice (deterministic, filesystem-only, no subprocess/container
 * spawning) — the build-execution surface (executeBuild, docker/podman
 * isolation) is a separate, riskier follow-up left for a dedicated design
 * pass, not bundled into this wire.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sandboxCommand } from '../cli/commands/sandbox-cmd.js'
import * as fallbackResolverModule from '../core/sandbox/fallback-resolver.js'
import * as openStoreModule from '../cli/open-store.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runSandboxDetect(dir: string): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await sandboxCommand().parseAsync(['detect', '-d', dir], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('sandboxCommand', () => {
  it('builds the "sandbox" command with a "detect" subcommand', () => {
    const cmd = sandboxCommand()
    expect(cmd.name()).toBe('sandbox')
    expect(cmd.commands.map((c) => c.name())).toContain('detect')
  })

  it('exposes a "build" subcommand (node_wire_7b67ba16613c — wires executeBuild)', () => {
    const cmd = sandboxCommand()
    expect(cmd.commands.map((c) => c.name())).toContain('build')
  })
})

describe('agf sandbox detect', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-sandbox-detect-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('detects an npm project (package.json + lock) with full confidence', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, 'package-lock.json'), '{}')

    const envelope = await runSandboxDetect(dir)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { stack: string; confidence: number; evidence: string[] }
    expect(data.stack).toBe('npm')
    expect(data.confidence).toBe(1)
    expect(data.evidence).toContain('package.json')
  })

  it("reports stack='auto' with confidence 0 when no markers are present", async () => {
    const envelope = await runSandboxDetect(dir)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { stack: string; confidence: number }
    expect(data.stack).toBe('auto')
    expect(data.confidence).toBe(0)
  })

  it('detects a maven project (pom.xml)', async () => {
    writeFileSync(join(dir, 'pom.xml'), '<project></project>')

    const envelope = await runSandboxDetect(dir)
    const data = envelope.data as { stack: string }
    expect(data.stack).toBe('maven')
  })
})

describe('agf sandbox build', () => {
  async function runSandboxBuild(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await sandboxCommand().parseAsync(['build', ...args], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return lastEnvelope(out)
  }

  it('runs a command under process isolation and reports a successful BuilderResult', async () => {
    const envelope = await runSandboxBuild(['--command', 'node', '--args', '-e,console.log(1)'])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { success: boolean; status: string; isolation: string; exitCode: number | null }
    expect(data.success).toBe(true)
    expect(data.status).toBe('success')
    expect(data.isolation).toBe('process')
    expect(data.exitCode).toBe(0)
  })

  it('reports a non-zero exit as status "failure"', async () => {
    const envelope = await runSandboxBuild(['--command', 'node', '--args', '-e,process.exit(2)'])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { success: boolean; status: string; exitCode: number | null }
    expect(data.success).toBe(false)
    expect(data.status).toBe('failure')
    expect(data.exitCode).toBe(2)
  })

  it('requires --command', async () => {
    await expect(runSandboxBuild([])).rejects.toThrow()
  })

  describe('--node (node_wire_8d30dbd59597 — wires updateGraphFromReport)', () => {
    function fakeStore(status: string): { store: SqliteStore; writes: Array<{ id: string; status: string }> } {
      const writes: Array<{ id: string; status: string }> = []
      const store = {
        getNodeById: (id: string) => ({ id, status }),
        updateNodeStatus: (id: string, s: string) => writes.push({ id, status: s }),
      } as unknown as SqliteStore
      return { store, writes }
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('blocks the task when the build fails', async () => {
      const { store, writes } = fakeStore('ready')
      vi.spyOn(openStoreModule, 'openStoreOrFail').mockReturnValue(store)

      const envelope = await runSandboxBuild(['--command', 'node', '--args', '-e,process.exit(2)', '--node', 'n1'])

      expect(envelope.ok).toBe(true)
      const data = envelope.data as { graphUpdate: { newStatus: string | null } }
      expect(data.graphUpdate.newStatus).toBe('blocked')
      expect(writes).toEqual([{ id: 'n1', status: 'blocked' }])
    })

    it('unblocks the task when a previously-blocked build succeeds', async () => {
      const { store, writes } = fakeStore('blocked')
      vi.spyOn(openStoreModule, 'openStoreOrFail').mockReturnValue(store)

      const envelope = await runSandboxBuild(['--command', 'node', '--args', '-e,console.log(1)', '--node', 'n1'])

      expect(envelope.ok).toBe(true)
      const data = envelope.data as { graphUpdate: { newStatus: string | null } }
      expect(data.graphUpdate.newStatus).toBe('in_progress')
      expect(writes).toEqual([{ id: 'n1', status: 'in_progress' }])
    })

    it('omits graphUpdate when --node is not passed', async () => {
      const envelope = await runSandboxBuild(['--command', 'node', '--args', '-e,console.log(1)'])
      const data = envelope.data as { graphUpdate?: unknown }
      expect(data.graphUpdate).toBeUndefined()
    })
  })
})

describe('agf sandbox architecture (node_wire_31d4f78dad8e — wires SANDBOX_ARCHITECTURE)', () => {
  async function runArchitecture(): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await sandboxCommand().parseAsync(['architecture'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return lastEnvelope(out)
  }

  it('exposes an "architecture" subcommand', () => {
    const cmd = sandboxCommand()
    expect(cmd.commands.map((c) => c.name())).toContain('architecture')
  })

  it('outputs the Wave-12 functional architecture document with all 5 layers', async () => {
    const envelope = await runArchitecture()
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { wave: string; layers: Array<{ id: number; name: string }> }
    expect(data.wave).toBe('wave-12')
    expect(data.layers).toHaveLength(5)
    expect(data.layers.map((l) => l.name)).toContain('IsolationLayer')
  })
})

describe('agf sandbox resolve-isolation (node_wire_5e58469405a0 — wires FallbackResolver)', () => {
  async function runResolveIsolation(): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await sandboxCommand().parseAsync(['resolve-isolation'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }
    return lastEnvelope(out)
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes a "resolve-isolation" subcommand', () => {
    const cmd = sandboxCommand()
    expect(cmd.commands.map((c) => c.name())).toContain('resolve-isolation')
  })

  it('reports executionMode="docker" when docker is available', async () => {
    vi.spyOn(fallbackResolverModule.FallbackResolver.prototype, 'checkDockerAvailability').mockResolvedValue(true)
    vi.spyOn(fallbackResolverModule.FallbackResolver.prototype, 'checkPodmanAvailability').mockResolvedValue(false)

    const envelope = await runResolveIsolation()
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { executionMode: string; fallbackChain: string[] }
    expect(data.executionMode).toBe('docker')
    expect(data.fallbackChain).toContain('docker')
  })

  it('falls back to "process" when docker and podman are unavailable', async () => {
    vi.spyOn(fallbackResolverModule.FallbackResolver.prototype, 'checkDockerAvailability').mockResolvedValue(false)
    vi.spyOn(fallbackResolverModule.FallbackResolver.prototype, 'checkPodmanAvailability').mockResolvedValue(false)

    const envelope = await runResolveIsolation()
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { executionMode: string }
    expect(data.executionMode).toBe('process')
  })
})
