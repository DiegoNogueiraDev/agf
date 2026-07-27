/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * CI contract for `.github/workflows/package-bun.yml`: every binary in the
 * cross-compile matrix (`scripts/bun-targets.mjs`) must be both uploaded as an
 * artifact AND attached (with its `.sha256`) to the GitHub Release. Derives the
 * expected names from ALL_TARGETS so a new build target can't be added without
 * the release workflow shipping it too (guards against dormant binaries).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ALL_TARGETS } from '../../scripts/bun-targets.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const workflow = readFileSync(path.join(ROOT, '.github', 'workflows', 'package-bun.yml'), 'utf-8')

describe('package-bun.yml release contract', () => {
  it('publishes every cross-compile target binary', () => {
    for (const t of ALL_TARGETS) {
      expect(workflow, `workflow must reference ${t.out}`).toContain(t.out)
    }
  })

  it('attaches a checksum for every binary in the Release upload step', () => {
    const uploadStep = workflow.slice(workflow.indexOf('gh release upload'))
    for (const t of ALL_TARGETS) {
      expect(uploadStep, `Release upload must include ${t.out}.sha256`).toContain(`${t.out}.sha256`)
    }
  })

  it('attaches binaries only on a real release event', () => {
    expect(workflow).toContain("if: github.event_name == 'release'")
  })
})
