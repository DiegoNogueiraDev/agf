/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Guards the native-matrix binaries job (node_e0fa8a909d79): on a v* tag, five NATIVE
 * runners each build their own target — so darwin is signed on real macOS instead of
 * cross-compiled unsigned on Linux — and publish the binary + sha256 to the GitHub
 * Release. Static contract over the YAML (no live CI needed).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const WF = join(process.cwd(), '.github', 'workflows', 'release.yml')

interface MatrixEntry {
  os?: string
  target?: string
}
interface Job {
  'runs-on'?: unknown
  strategy?: { matrix?: { include?: MatrixEntry[] } }
  steps?: Array<{ run?: string; uses?: string; name?: string }>
}

function binariesJob(): Job {
  const wf = parse(readFileSync(WF, 'utf8')) as { jobs: Record<string, Job> }
  const job = Object.values(wf.jobs).find((j) => j.strategy?.matrix?.include?.some((e) => e.target))
  if (!job) throw new Error('native-matrix binaries job not found')
  return job
}

describe('release.yml — native-matrix binaries', () => {
  it('builds on a matrix of 5 native OS runners (2 macOS, 2 linux, 1 windows)', () => {
    const inc = binariesJob().strategy?.matrix?.include ?? []
    expect(inc).toHaveLength(5)
    const os = inc.map((e) => e.os ?? '').join(' ')
    expect(os).toMatch(/macos/) // real macOS → darwin signs natively
    expect((os.match(/macos/g) ?? []).length).toBe(2)
    expect(os).toMatch(/ubuntu/)
    expect(os).toMatch(/windows/)
  })

  it('each runner runs on its own OS (runs-on = matrix.os), not a single self-hosted host', () => {
    expect(binariesJob()['runs-on']).toBe('${{ matrix.os }}')
  })

  it('builds only the host target per runner and publishes binary + sha256 to the Release', () => {
    const steps = binariesJob().steps ?? []
    const blob = steps.map((s) => `${s.run ?? ''} ${s.uses ?? ''}`).join('\n')
    expect(blob).toMatch(/pack:bun:host/) // native single-target build, not the Linux cross-compile
    expect(blob).toMatch(/sha256|shasum/i)
    expect(blob).toMatch(/gh release|action-gh-release/i)
  })
})
