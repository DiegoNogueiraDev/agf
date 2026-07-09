/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Guards the output-discipline guidance that teaches host CLIs to consume
 * `agf` JSON at minimal token/memory cost — and that the generated context
 * stays 100% `agf` (zero `rtk`, the name of the private checkout the compression
 * engine was once aliased to).
 */

import { describe, it, expect } from 'vitest'
import { generateContractSection } from '../core/output/consumer-contract.js'
import { generateCliContext, CLI_TARGETS } from '../core/spec-templates/agent-format.js'

describe('output-discipline guidance', () => {
  const contract = generateContractSection()

  it('teaches --select field projection and --pretty', () => {
    expect(contract).toContain('--select')
    expect(contract).toContain('--pretty')
  })

  it('teaches native composition via agf exec', () => {
    expect(contract).toMatch(/agf exec/)
  })

  it('gives both POSIX (jq) and PowerShell equivalents', () => {
    expect(contract).toContain('jq')
    expect(contract).toContain('ConvertFrom-Json')
  })

  it('uses the OS temp dir, not a hardcoded /tmp only', () => {
    expect(contract.toLowerCase()).toMatch(/tmpdir|%temp%/)
  })

  it('directs agf compress at OTHER tools, never wrapping agf itself', () => {
    expect(contract).toMatch(/agf compress/)
  })

  it('cites a grounding (Fundamentação / Sources)', () => {
    expect(contract).toMatch(/Fundamenta|Sources/i)
  })

  it('mentions the new commands exec / code / savings', () => {
    expect(contract).toMatch(/\bexec\b/)
    expect(contract).toMatch(/\bcode\b/)
    expect(contract).toMatch(/\bsavings\b/)
  })
})

describe('generated CLI context', () => {
  it('propagates --select to every CLI target and never names `rtk`', () => {
    // There used to be a carve-out here for the `agf rtk` alias, which stripped the
    // command before testing for the word. The alias is gone, so the assertion is
    // unconditional — and no longer trivially true for any input.
    for (const cli of CLI_TARGETS) {
      const body = generateCliContext(cli, 'demo', 'full')
      expect(body, `${cli} should teach --select`).toContain('--select')
      expect(/\brtk\b/i.test(body), `${cli} must not mention rtk`).toBe(false)
    }
  })
})
