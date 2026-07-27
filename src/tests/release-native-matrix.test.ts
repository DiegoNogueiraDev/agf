/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Guards the DARWIN-SIGNED-NATIVELY contract. This used to be a hosted native matrix in
 * release.yml (node_e0fa8a909d79) — five hosted OS runners, one per target. That was dropped:
 * a self-hosted CI cannot keep hosted runners ("fix(ci): every job self-hosted"). The contract
 * moved to package-bun.yml's `release` job, which runs on a self-hosted macOS runner so darwin
 * is signed by `codesign` (not cross-compiled unsigned on Linux) and publishes the binaries +
 * sha256 to the release channel. Static contract over the YAML (no live CI needed).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const WF = join(process.cwd(), '.github', 'workflows', 'package-bun.yml')

interface Job {
  'runs-on'?: unknown
  steps?: Array<{ run?: string; uses?: string; name?: string }>
}

function releaseJob(): Job {
  const wf = parse(readFileSync(WF, 'utf8')) as { jobs: Record<string, Job> }
  const job = Object.values(wf.jobs).find((j) =>
    (j.steps ?? []).some((s) => /Publish binaries to the release channel/i.test(s.name ?? '')),
  )
  if (!job) throw new Error('self-hosted release job not found')
  return job
}

describe('package-bun.yml — self-hosted release signs darwin natively', () => {
  it('the release job runs on a self-hosted macOS runner (so darwin is signed, not cross-compiled unsigned)', () => {
    // runs-on = ${{ fromJSON(vars.AGF_MAC_RUNNER_LABELS) }} — a real macOS host, not a hosted matrix.
    expect(JSON.stringify(releaseJob()['runs-on'])).toMatch(/AGF_MAC_RUNNER_LABELS/)
  })

  it('refuses to publish an unsigned darwin binary (codesign verification)', () => {
    const blob = (releaseJob().steps ?? []).map((s) => `${s.name ?? ''} ${s.run ?? ''}`).join('\n')
    expect(blob).toMatch(/codesign/)
    expect(blob).toMatch(/unsigned darwin/i)
  })

  it('builds the binaries and publishes them + sha256 to the release channel', () => {
    const blob = (releaseJob().steps ?? []).map((s) => `${s.run ?? ''} ${s.uses ?? ''}`).join('\n')
    expect(blob).toMatch(/pack:bun/)
    expect(blob).toMatch(/sha256|shasum/i)
    expect(blob).toMatch(/scp|gh release|action-gh-release/i)
  })
})
