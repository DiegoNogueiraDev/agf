import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

const CLI = 'npx tsx src/cli/index.ts'
const TIMEOUT = 15000

describe('E2E — CLI smoke', () => {
  it('--help outputs usage', () => {
    const out = execSync(`${CLI} --help`, { timeout: TIMEOUT }).toString()
    expect(out).toContain('Usage:')
    expect(out).toContain('agent-graph-flow')
  })

  it('--version outputs version', () => {
    const out = execSync(`${CLI} --version`, { timeout: TIMEOUT }).toString()
    expect(out).toMatch(/\d+\.\d+\.\d+/)
  })

  const commands = [
    'import-prd',
    'phase',
    'next',
    'decompose',
    'check',
    'autopilot',
    'run',
    'model',
    'stats',
    'metrics',
    'tui',
    'login',
    'logout',
    'init',
    'daemon',
    'doctor',
    'gc',
    'skill',
    'profile',
    'principles',
    'generate-prd',
    'build',
    'quality',
    'ui',
    'provider',
    'harness',
    'constitution',
    'plugin',
    'preset',
    'spec',
    'insights',
    'gate',
    'kanban',
    'adr',
    'learning',
    'heal',
    'scaffold',
  ]

  for (const cmd of commands) {
    it(`${cmd} --help outputs usage`, () => {
      const out = execSync(`${CLI} ${cmd} --help`, { timeout: TIMEOUT }).toString()
      expect(out).toContain('Usage:')
      expect(out.length).toBeGreaterThan(10)
    })
  }
})

describe('E2E — harness scan smoke', () => {
  it('harness command produces valid output', () => {
    const out = execSync(`${CLI} harness`, { timeout: TIMEOUT }).toString()
    const json = JSON.parse(out)
    expect(json.ok).toBe(true)
    expect(json.data.score).toBeGreaterThan(0)
    expect(json.data.grade).toMatch(/[ABCD]/)
  })
})

describe('E2E — test:smoke', () => {
  it('smoke suite runs and passes', () => {
    const out = execSync('npx vitest run --config vitest.smoke.config.ts', {
      timeout: TIMEOUT,
    }).toString()
    expect(out).toContain('passed')
  })
})
