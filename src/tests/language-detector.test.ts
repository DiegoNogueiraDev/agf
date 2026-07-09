/*!
 * SPDX-License-Identifier: Apache-2.0
 * Tests for src/core/lsp/language-detector.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectProjectLanguages } from '../core/lsp/language-detector.js'
import { ServerRegistry } from '../core/lsp/server-registry.js'

describe('detectProjectLanguages', () => {
  let tmpDir: string
  let registry: ServerRegistry

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lang-detector-test-'))
    registry = new ServerRegistry()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array for a directory with no recognized files', () => {
    const results = detectProjectLanguages(tmpDir, registry)
    expect(results).toEqual([])
  })

  it('detects TypeScript when tsconfig.json is present', () => {
    writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }))
    const results = detectProjectLanguages(tmpDir, registry)
    const ts = results.find((r) => r.languageId === 'typescript')
    expect(ts).toBeDefined()
    expect(ts?.detectedVia).toBe('config_file')
    expect(ts?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('detects Python when pyproject.toml is present', () => {
    writeFileSync(join(tmpDir, 'pyproject.toml'), '[tool.poetry]\nname = "myproject"\n')
    const results = detectProjectLanguages(tmpDir, registry)
    const py = results.find((r) => r.languageId === 'python')
    expect(py).toBeDefined()
    expect(py?.detectedVia).toBe('config_file')
  })

  it('detects multiple languages when multiple config files are present', () => {
    writeFileSync(join(tmpDir, 'tsconfig.json'), '{}')
    writeFileSync(join(tmpDir, 'go.mod'), 'module example.com/myapp\ngo 1.21\n')
    const results = detectProjectLanguages(tmpDir, registry)
    const ids = results.map((r) => r.languageId)
    expect(ids).toContain('typescript')
    expect(ids).toContain('go')
  })
})
