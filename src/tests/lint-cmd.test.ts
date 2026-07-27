import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lintCommand, buildLintInvocation, parseEslintOutput } from '../cli/commands/lint-cmd.js'

describe('lintCommand', () => {
  it('returns a Command instance', () => {
    const cmd = lintCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = lintCommand()
    expect(cmd.name()).toBe('lint')
  })

  it('has a non-empty description', () => {
    const cmd = lintCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

describe('buildLintInvocation — no shell injection (CWE-78 / DEP0190)', () => {
  it('never spawns with a shell (args are literal argv, not a concatenated shell string)', () => {
    expect(buildLintInvocation({}).shell).toBe(false)
    expect(buildLintInvocation({ file: 'src/x.ts' }).shell).toBe(false)
  })

  it('passes a --file path with shell metacharacters as a SINGLE literal arg', () => {
    const payload = 'nonexistent.ts; touch /tmp/pwned'
    const { args } = buildLintInvocation({ file: payload })
    // The whole payload is one argv element — no shell to split or interpret it.
    expect(args).toContain(payload)
    expect(args.filter((a) => a.includes('touch'))).toHaveLength(1)
  })

  it('builds the default project lint (eslint --format json --ext .ts,.tsx src/)', () => {
    const { command, args } = buildLintInvocation({})
    expect(command).toBe('npx')
    // --format json is REQUIRED: it is what makes the output machine-parseable into the
    // envelope. Without it eslint prints human text that breaks the JSON contract / exec chain.
    expect(args).toContain('--format')
    expect(args).toContain('json')
    expect(args).toEqual(['eslint', '--format', 'json', '--ext', '.ts,.tsx', 'src/'])
  })

  it('adds --fix and drops the default target when a file is given', () => {
    const { args } = buildLintInvocation({ fix: true, file: 'a.ts' })
    expect(args).toEqual(['eslint', '--format', 'json', '--fix', 'a.ts'])
  })
})

describe('parseEslintOutput — structures eslint JSON into an envelope-safe report', () => {
  it('aggregates counts and flattens findings across files', () => {
    const eslintJson = JSON.stringify([
      {
        filePath: '/repo/src/a.ts',
        errorCount: 1,
        warningCount: 1,
        messages: [
          { ruleId: 'no-unused-vars', severity: 2, message: 'x unused', line: 3, column: 5 },
          { ruleId: 'no-console', severity: 1, message: 'no console', line: 9, column: 1 },
        ],
      },
      { filePath: '/repo/src/b.ts', errorCount: 0, warningCount: 0, messages: [] },
    ])
    const report = parseEslintOutput(eslintJson)
    expect(report.errorCount).toBe(1)
    expect(report.warningCount).toBe(1)
    expect(report.passed).toBe(false)
    expect(report.findings).toHaveLength(2)
    expect(report.findings[0]).toMatchObject({
      file: '/repo/src/a.ts',
      ruleId: 'no-unused-vars',
      severity: 'error',
      line: 3,
    })
    expect(report.findings[1]).toMatchObject({ ruleId: 'no-console', severity: 'warning' })
  })

  it('reports passed:true with zero findings on a clean run (empty array)', () => {
    const report = parseEslintOutput('[]')
    expect(report.passed).toBe(true)
    expect(report.errorCount).toBe(0)
    expect(report.warningCount).toBe(0)
    expect(report.findings).toEqual([])
  })

  it('warnings-only run still passes (eslint exit-0 semantics)', () => {
    const eslintJson = JSON.stringify([
      {
        filePath: '/x.ts',
        errorCount: 0,
        warningCount: 2,
        messages: [
          { ruleId: 'r1', severity: 1, message: 'w', line: 1, column: 1 },
          { ruleId: 'r2', severity: 1, message: 'w', line: 2, column: 1 },
        ],
      },
    ])
    const report = parseEslintOutput(eslintJson)
    expect(report.passed).toBe(true)
    expect(report.warningCount).toBe(2)
  })

  it('never throws on non-JSON stdout — degrades to a structured parse-error report', () => {
    const report = parseEslintOutput('/Users/foo/bar.ts\n  1:1 warning something\n')
    expect(report.passed).toBe(false)
    expect(report.parseError).toBe(true)
    expect(report.findings).toEqual([])
  })
})

describe('agf lint — the invocation cannot execute an injected command (live proof)', () => {
  const marker = join(tmpdir(), `agf-lint-injection-marker-${process.pid}`)
  afterEach(() => rmSync(marker, { force: true }))

  it('does not run the metacharacter payload in --file', () => {
    const { command, args, shell } = buildLintInvocation({ file: `nonexistent.ts; touch ${marker}` })
    // Spawn exactly as the command does. With shell:false the payload reaches eslint as a
    // literal path (eslint errors "not found"); the `touch` is never executed.
    spawnSync(command, args, { stdio: 'ignore', shell, timeout: 60_000 })
    expect(existsSync(marker)).toBe(false)
  })
})
