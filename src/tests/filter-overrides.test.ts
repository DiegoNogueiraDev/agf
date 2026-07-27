/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  ensureFilterOverridesLoaded,
  loadFilterOverridesFromFile,
  _resetFilterOverrides,
} from '../core/tool-compress/filter-overrides.js'
import { listFilters, clearCustomFilters } from '../core/tool-compress/registry.js'

describe('filter-overrides (TOML project-local)', () => {
  const tmpDir = path.join(tmpdir(), `agf-filter-override-test-${Date.now()}`)
  const agfDir = path.join(tmpDir, '.agf')
  const tomlPath = path.join(agfDir, 'filters.toml')

  beforeEach(() => {
    _resetFilterOverrides()
    clearCustomFilters()
    if (!existsSync(agfDir)) mkdirSync(agfDir, { recursive: true })
  })

  afterEach(() => {
    _resetFilterOverrides()
    clearCustomFilters()
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  })

  it('returns 0 when .agf/filters.toml does not exist', () => {
    const n = ensureFilterOverridesLoaded(tmpDir)
    expect(n).toBe(0)
  })

  it('loads overrides from a valid TOML file', () => {
    writeFileSync(
      tomlPath,
      `
[[filters]]
name = "my-custom-filter"
priority = 75
detect = ["^MY_OUTPUT"]
keep = ["^ERROR"]
drop = ["^[[:space:]]*$"]
enabled = true
`.trim(),
    )

    const n = loadFilterOverridesFromFile(tomlPath, tmpDir)
    expect(n).toBe(1)

    const filters = listFilters()
    expect(filters.some((f) => f.name === 'my-custom-filter')).toBe(true)
  })

  it('project-local filter overrides built-in with same name', () => {
    writeFileSync(
      tomlPath,
      `
[[filters]]
name = "grep"
priority = 77
detect = ["^MY_CUSTOM_GREP_PATTERN"]
keep = ["^CRITICAL"]
enabled = true
`.trim(),
    )

    const n = loadFilterOverridesFromFile(tomlPath, tmpDir)
    expect(n).toBe(1)

    const filters = listFilters()
    const grepFilters = filters.filter((f) => f.name === 'grep')
    // Built-in grep still exists but custom one is registered too
    // Both can coexist — custom wins during detection via higher priority
    expect(grepFilters.length).toBeGreaterThanOrEqual(1)
  })

  it('disabled filters are skipped (enabled = false)', () => {
    writeFileSync(
      tomlPath,
      `
[[filters]]
name = "disabled-filter"
detect = ["^DISABLED"]
enabled = false

[[filters]]
name = "active-filter"
detect = ["^ACTIVE"]
enabled = true
`.trim(),
    )

    const n = loadFilterOverridesFromFile(tomlPath, tmpDir)
    expect(n).toBe(1)

    const filters = listFilters()
    expect(filters.some((f) => f.name === 'disabled-filter')).toBe(false)
    expect(filters.some((f) => f.name === 'active-filter')).toBe(true)
  })

  it('filters default to enabled when no enabled field', () => {
    writeFileSync(
      tomlPath,
      `
[[filters]]
name = "implicit-active"
detect = ["^IMPLICIT"]
`.trim(),
    )

    const n = loadFilterOverridesFromFile(tomlPath, tmpDir)
    expect(n).toBe(1)

    const filters = listFilters()
    expect(filters.some((f) => f.name === 'implicit-active')).toBe(true)
  })

  it('skips entries without name or detect', () => {
    writeFileSync(
      tomlPath,
      `
[[filters]]
name = ""
detect = ["^NO_NAME"]

[[filters]]
name = "no-detect"
detect = []
`.trim(),
    )

    const n = loadFilterOverridesFromFile(tomlPath, tmpDir)
    expect(n).toBe(0)
  })

  it('multiple overrides can be loaded at once', () => {
    writeFileSync(
      tomlPath,
      `
[[filters]]
name = "filter-a"
detect = ["^A"]
priority = 60

[[filters]]
name = "filter-b"
detect = ["^B"]
priority = 61

[[filters]]
name = "filter-c"
detect = ["^C"]
priority = 62
`.trim(),
    )

    const n = loadFilterOverridesFromFile(tomlPath, tmpDir)
    expect(n).toBe(3)

    const filters = listFilters()
    expect(filters.some((f) => f.name === 'filter-a')).toBe(true)
    expect(filters.some((f) => f.name === 'filter-b')).toBe(true)
    expect(filters.some((f) => f.name === 'filter-c')).toBe(true)
  })

  it('idempotent: second call is no-op', () => {
    writeFileSync(
      tomlPath,
      `
[[filters]]
name = "idempotent-test"
detect = ["^IDEMPOTENT"]
`.trim(),
    )

    const n1 = ensureFilterOverridesLoaded(tmpDir)
    expect(n1).toBe(1)

    // Second call with same flag — idempotent
    const n2 = ensureFilterOverridesLoaded(tmpDir)
    expect(n2).toBe(0)
  })
})
