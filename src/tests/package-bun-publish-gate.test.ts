/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Guards the fix for the darwin-clobber bug (node_51d3c2f4b804): package-bun builds on
 * every push (validation) but must PUBLISH to /releases ONLY on a release commit — else
 * every feature push republishes the CI's unsigned darwin over the signed one.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const WF = join(process.cwd(), '.github', 'workflows', 'package-bun.yml')

interface Step {
  name?: string
  if?: string
  run?: string
}

function publishStep(): Step {
  const wf = parse(readFileSync(WF, 'utf8')) as { jobs: Record<string, { steps: Step[] }> }
  const steps = Object.values(wf.jobs)[0].steps
  const step = steps.find((s) => /Publish binaries to the release channel/i.test(s.name ?? ''))
  if (!step) throw new Error('publish step not found')
  return step
}

describe('package-bun publish gate', () => {
  it('the publish step is gated by an `if` (not run on every push)', () => {
    expect(publishStep().if).toBeTruthy()
  })

  it('never hardcodes the release host filesystem layout', () => {
    // A public repo must not disclose where the serving machine keeps its files.
    // The path arrives from a repository secret; the step skips when it is absent,
    // so a fork's CI stays green instead of failing on infrastructure it lacks.
    const raw = readFileSync(WF, 'utf8')
    expect(raw).not.toMatch(/\/opt\//)
    expect(raw).toMatch(/secrets\.AGF_RELEASES_DIR/)
    expect(String(publishStep().run ?? '')).toMatch(/skipping publish/)
  })

  it('the gate publishes only on a release commit or a manual dispatch', () => {
    const cond = publishStep().if ?? ''
    expect(cond).toMatch(/chore\(release\)|workflow_dispatch|event_name == 'release'/)
  })
})
