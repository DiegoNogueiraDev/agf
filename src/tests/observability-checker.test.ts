/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkObservability } from '../core/analyzer/observability-checker.js'

describe('checkObservability', () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'obs-test-'))
    const srcCore = join(tmpDir, 'src', 'core')
    const srcMcp = join(tmpDir, 'src', 'mcp')
    mkdirSync(srcCore, { recursive: true })
    mkdirSync(srcMcp, { recursive: true })
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns report for an empty project with no source files', () => {
    const result = checkObservability(tmpDir)
    expect(result.mode).toBe('observability_check')
    expect(typeof result.score).toBe('number')
    expect(typeof result.grade).toBe('string')
    expect(Array.isArray(result.checks)).toBe(true)
    expect(Array.isArray(result.gaps)).toBe(true)
  })

  it('detects logger coverage when source files use logger', () => {
    const coreDir = join(tmpDir, 'src', 'core')
    writeFileSync(
      join(coreDir, 'service.ts'),
      `export function doStuff() {
  logger.info('doing stuff')
}`,
    )
    writeFileSync(
      join(coreDir, 'handler.ts'),
      `export function handle() {
  logger.debug('handling')
}`,
    )
    const result = checkObservability(tmpDir)
    const loggerCheck = result.checks.find((c) => c.name === 'logger_coverage')
    expect(loggerCheck).toBeDefined()
    expect(loggerCheck!.passed).toBe(true)
  })

  it('flags console.log usage as a finding', () => {
    const mcpDir = join(tmpDir, 'src', 'mcp')
    writeFileSync(
      join(mcpDir, 'bad.ts'),
      `export function bad() {
  console.log('debug')
}`,
    )
    const result = checkObservability(tmpDir)
    const structuredCheck = result.checks.find((c) => c.name === 'structured_logging')
    expect(structuredCheck).toBeDefined()
    expect(result.findings.some((f) => f.rule === 'no-console')).toBe(true)
  })

  it('reports non-existent path gracefully (no src dir)', () => {
    const result = checkObservability('/tmp/nonexistent-obs-path-99999')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.checks)).toBe(true)
  })
})
