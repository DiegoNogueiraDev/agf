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
