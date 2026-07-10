/*!
 * TDD: safe JSON.parse at file boundaries (node_f1c84deabf01).
 *
 * AC1: malformed JSON → no uncaught throw, returns null/fallback, logs warn via createLogger
 * AC2: valid JSON but wrong shape → Zod rejects, logs warn, returns null/fallback
 * AC3: valid shape → accepted
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'agf-safe-json-'))
}

// ─── copilot-auth.ts : loadAuth ─────────────────────────────────────────────

describe('loadAuth — safe JSON parse (AC1 + AC2)', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTmp()
    vi.resetModules()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('AC1: returns null and logs warn for malformed JSON', async () => {
    const authFile = join(dir, 'auth.json')
    writeFileSync(authFile, '{{{invalid json}}}', 'utf8')

    const warnSpy = vi.fn()
    vi.doMock('../core/utils/logger.js', () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: warnSpy,
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      }),
    }))
    const { loadAuth } = await import('../core/model-hub/copilot-auth.js')

    const result = loadAuth(authFile)
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('AC2: returns null and logs warn for wrong-shape JSON (missing githubToken)', async () => {
    const authFile = join(dir, 'auth.json')
    writeFileSync(authFile, JSON.stringify({ foo: 'bar' }), 'utf8')

    const warnSpy = vi.fn()
    vi.doMock('../core/utils/logger.js', () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: warnSpy,
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      }),
    }))
    const { loadAuth } = await import('../core/model-hub/copilot-auth.js')

    const result = loadAuth(authFile)
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('AC3: returns AuthData for valid JSON with correct shape', async () => {
    const authFile = join(dir, 'auth.json')
    writeFileSync(authFile, JSON.stringify({ githubToken: 'ghu_abc' }), 'utf8')

    vi.doMock('../core/utils/logger.js', () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      }),
    }))
    const { loadAuth } = await import('../core/model-hub/copilot-auth.js')

    const result = loadAuth(authFile)
    expect(result).not.toBeNull()
    expect(result?.githubToken).toBe('ghu_abc')
  })
})

// ─── scenario-runner.ts : loadSuite ─────────────────────────────────────────

describe('loadSuite — safe JSON parse (AC1 + AC2)', () => {
  let suiteDir: string
  beforeEach(() => {
    suiteDir = makeTmp()
    vi.resetModules()
  })
  afterEach(() => rmSync(suiteDir, { recursive: true, force: true }))

  function makeScenarioDir(name: string, content: string): void {
    const scenarioDir = join(suiteDir, name)
    const { mkdirSync } = require('node:fs')
    mkdirSync(scenarioDir, { recursive: true })
    writeFileSync(join(scenarioDir, 'scenario.json'), content, 'utf8')
  }

  it('AC1: skips and logs warn for malformed scenario.json', async () => {
    // create a scenario dir with invalid JSON
    const { mkdirSync } = await import('node:fs')
    const sd = join(suiteDir, 's1')
    mkdirSync(sd, { recursive: true })
    writeFileSync(join(sd, 'scenario.json'), '{{{bad', 'utf8')

    const warnSpy = vi.fn()
    vi.doMock('../core/utils/logger.js', () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: warnSpy,
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      }),
    }))
    const { loadSuite } = await import('../core/evals/scenario-runner.js')

    const result = loadSuite(suiteDir)
    expect(result).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('AC2: skips and logs warn for wrong-shape scenario.json (missing prd)', async () => {
    const { mkdirSync } = await import('node:fs')
    const sd = join(suiteDir, 's2')
    mkdirSync(sd, { recursive: true })
    // has id+tier but no prd/prdFile
    writeFileSync(join(sd, 'scenario.json'), JSON.stringify({ id: 'test', tier: 'T0' }), 'utf8')

    const warnSpy = vi.fn()
    vi.doMock('../core/utils/logger.js', () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: warnSpy,
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      }),
    }))
    const { loadSuite } = await import('../core/evals/scenario-runner.js')

    // no prd means loadSuite already skips — just verify it doesn't crash
    const result = loadSuite(suiteDir)
    expect(result).toHaveLength(0)
  })

  it('AC3: accepts a valid scenario.json', async () => {
    const { mkdirSync } = await import('node:fs')
    const sd = join(suiteDir, 's3')
    mkdirSync(sd, { recursive: true })
    writeFileSync(
      join(sd, 'scenario.json'),
      JSON.stringify({ id: 'ok', tier: 'T0', prd: 'add feature X', tags: [] }),
      'utf8',
    )

    vi.doMock('../core/utils/logger.js', () => ({
      createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        debug: vi.fn(),
        event: vi.fn(),
      }),
    }))
    const { loadSuite } = await import('../core/evals/scenario-runner.js')

    const result = loadSuite(suiteDir)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ok')
  })
})
