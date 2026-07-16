/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_8afe7afda8ae: build-linux-packages.sh (AppImage/.deb) had a real,
 * tested build script (node_d02c01bd85a4) that was never wired into any CI
 * workflow — no artifact ever reached a user, despite the task being marked
 * done. This wires it into package-bun.yml, the actual current release
 * pipeline (self-hosted, publishes to the live server).
 *
 * Non-fatal by design: this runner may not have Docker, and a packaging
 * failure must never break the existing (working) binary release flow.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'package-bun.yml')
const workflow = existsSync(WORKFLOW) ? readFileSync(WORKFLOW, 'utf-8') : ''

describe('package-bun.yml — Linux .deb/AppImage packaging is wired, non-fatally', () => {
  it('runs build-linux-packages.sh after the standalone binaries are built', () => {
    const buildIdx = workflow.indexOf('pack:bun') // the step that builds the standalone binaries
    const packagesIdx = workflow.indexOf('build-linux-packages.sh')
    expect(buildIdx).toBeGreaterThan(-1)
    expect(packagesIdx).toBeGreaterThan(buildIdx)
  })

  it('never fails the workflow if Docker/packaging is unavailable on this runner', () => {
    const step = workflow.slice(workflow.indexOf('Build Linux packages'), workflow.indexOf('Upload binaries'))
    expect(step).toMatch(/continue-on-error:\s*true/)
  })

  it('attaches the .deb/.AppImage as a separate, non-blocking step', () => {
    // Self-hosted model: the packages are attached to the Release in their own step (not an
    // upload-artifact), and the Linux build is continue-on-error so a Docker-less runner never
    // fails the workflow — that is what makes it non-blocking.
    const attachIdx = workflow.indexOf('Attach Linux packages to the Release')
    expect(attachIdx).toBeGreaterThan(-1)
    const attachStep = workflow.slice(attachIdx)
    expect(attachStep).toMatch(/dist-packages\/\*\.deb/)
    expect(attachStep).toMatch(/\.AppImage/)
    expect(workflow.slice(workflow.indexOf('Build Linux packages'))).toMatch(/continue-on-error:\s*true/)
  })

  it('attaches the Linux packages to the Release when they were produced', () => {
    const releaseStep = workflow.slice(workflow.indexOf('Attach binaries to the Release'))
    expect(releaseStep).toContain('dist-packages')
  })
})
