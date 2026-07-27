/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Static contract test for the daily binary-scan workflow: scheduled, secret-keyed,
 * publishing SCANINFO next to BUILDINFO — without a hardcoded key leaking into the repo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const WF = join(process.cwd(), '.github', 'workflows', 'scan-binaries.yml')

describe('scan-binaries daily workflow', () => {
  it('exists', () => {
    expect(existsSync(WF)).toBe(true)
  })

  it('runs on a daily cron schedule', () => {
    const wf = parse(readFileSync(WF, 'utf8')) as { on?: { schedule?: Array<{ cron?: string }> } }
    const crons = wf.on?.schedule?.map((s) => s.cron) ?? []
    expect(crons.length).toBeGreaterThan(0)
    expect(crons.every((c) => typeof c === 'string' && c.split(/\s+/).length === 5)).toBe(true)
  })

  it('passes VT_API_KEY ONLY via a GitHub secret — never a hardcoded value', () => {
    const raw = readFileSync(WF, 'utf8')
    expect(raw).toContain('${{ secrets.VT_API_KEY }}')
    const hardcoded = raw
      .split('\n')
      .filter((l) => /VT_API_KEY\s*:/.test(l))
      .filter((l) => !l.includes('${{ secrets.VT_API_KEY }}'))
    expect(hardcoded).toEqual([])
  })

  it('invokes scan-binaries against the published releases dir', () => {
    const raw = readFileSync(WF, 'utf8')
    expect(raw).toMatch(/scan-binaries/)
    // A public repo must not disclose the serving machine's filesystem layout — and
    // that includes an assertion that names the path in order to forbid it. Match the
    // shape of an absolute system path instead of the one we happen to use.
    expect(raw).not.toMatch(/\/(opt|srv|var\/www)\//)
    expect(raw).toContain('secrets.AGF_RELEASES_DIR')
  })
})
