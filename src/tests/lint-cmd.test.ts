import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lintCommand, buildLintInvocation } from '../cli/commands/lint-cmd.js'

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

  it('builds the default project lint (eslint --ext .ts,.tsx src/)', () => {
    const { command, args } = buildLintInvocation({})
    expect(command).toBe('npx')
    expect(args).toEqual(['eslint', '--ext', '.ts,.tsx', 'src/'])
  })

  it('adds --fix and drops the default target when a file is given', () => {
    const { args } = buildLintInvocation({ fix: true, file: 'a.ts' })
    expect(args).toEqual(['eslint', '--fix', 'a.ts'])
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
