/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { resolveTestCommandFromInput, withTestFiles, type ResolveInput } from '../core/runner/resolve-test-command.js'

const r = (i: ResolveInput) => resolveTestCommandFromInput(i)

describe('resolveTestCommandFromInput — language-agnostic test runner', () => {
  it('explicit --test-cmd wins over all detection (split into cmd+args)', () => {
    const out = r({ explicit: 'pnpm test --run', files: ['Cargo.toml'] })
    expect(out).toEqual({ cmd: 'pnpm', args: ['test', '--run'], runner: 'custom', language: 'custom' })
  })

  it('JS: a real npm "test" script is the canonical entry', () => {
    const out = r({ files: ['package.json'], pkgScripts: { test: 'vitest run' } })
    expect(out).toMatchObject({ cmd: 'npm', args: ['test'], runner: 'npm-script' })
  })

  it('JS: ignores the npm placeholder test script and falls back to framework', () => {
    const out = r({
      files: ['package.json'],
      pkgScripts: { test: 'echo "Error: no test specified" && exit 1' },
      pkgDeps: { vitest: '^1.0.0' },
    })
    expect(out).toMatchObject({ runner: 'vitest', cmd: 'npx' })
    expect(out?.args).toEqual(['vitest', 'run'])
  })

  it('JS: detects vitest / jest / mocha from deps', () => {
    expect(r({ files: ['package.json'], pkgDeps: { vitest: '1' } })?.runner).toBe('vitest')
    expect(r({ files: ['package.json'], pkgDeps: { jest: '1' } })?.runner).toBe('jest')
    expect(r({ files: ['package.json'], pkgDeps: { mocha: '1' } })?.runner).toBe('mocha')
  })

  it('Python: pyproject/setup/requirements → python -m pytest', () => {
    for (const f of ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile', 'tox.ini']) {
      const out = r({ files: [f] })
      expect(out, f).toMatchObject({ cmd: 'python', args: ['-m', 'pytest'], runner: 'pytest', language: 'python' })
    }
  })

  it('Rust: Cargo.toml → cargo test', () => {
    expect(r({ files: ['Cargo.toml'] })).toMatchObject({
      cmd: 'cargo',
      args: ['test'],
      runner: 'cargo',
      language: 'rust',
    })
  })

  it('Go: go.mod → go test ./...', () => {
    expect(r({ files: ['go.mod'] })).toMatchObject({ cmd: 'go', args: ['test', './...'], runner: 'go', language: 'go' })
  })

  it('Java: pom.xml → mvn test; gradle → gradle test', () => {
    expect(r({ files: ['pom.xml'] })).toMatchObject({ cmd: 'mvn', args: ['test'], runner: 'maven', language: 'java' })
    expect(r({ files: ['build.gradle'] })).toMatchObject({ runner: 'gradle', language: 'java' })
    expect(r({ files: ['build.gradle.kts'] })?.runner).toBe('gradle')
  })

  it('Ruby: Gemfile → bundle exec rspec', () => {
    expect(r({ files: ['Gemfile', '.rspec'] })).toMatchObject({ cmd: 'bundle', runner: 'rspec', language: 'ruby' })
  })

  it('PHP: composer.json → composer test (script) or vendor/bin/phpunit', () => {
    expect(r({ files: ['composer.json'], pkgScripts: { test: 'phpunit' } })).toMatchObject({
      cmd: 'composer',
      runner: 'composer-script',
      language: 'php',
    })
    expect(r({ files: ['composer.json', 'phpunit.xml'] })).toMatchObject({ runner: 'phpunit', language: 'php' })
  })

  it('.NET: any .csproj/.sln → dotnet test', () => {
    expect(r({ files: ['Api.csproj'] })).toMatchObject({
      cmd: 'dotnet',
      args: ['test'],
      runner: 'dotnet',
      language: 'dotnet',
    })
    expect(r({ files: ['Solution.sln'] })?.runner).toBe('dotnet')
  })

  it('Elixir: mix.exs → mix test', () => {
    expect(r({ files: ['mix.exs'] })).toMatchObject({ cmd: 'mix', args: ['test'], runner: 'mix', language: 'elixir' })
  })

  it('returns null when no test signal is present', () => {
    expect(r({ files: ['README.md', 'LICENSE'] })).toBeNull()
    expect(r({ files: [] })).toBeNull()
  })
})

describe('withTestFiles — targeted runs per runner', () => {
  it('npm-script forwards files after -- (npm test -- <files>)', () => {
    const resolved = { cmd: 'npm', args: ['test'], runner: 'npm-script', language: 'js' }
    expect(withTestFiles(resolved, ['a.test.ts', 'b.test.ts'])).toEqual({
      cmd: 'npm',
      args: ['test', '--', 'a.test.ts', 'b.test.ts'],
    })
  })

  it('vitest/jest/pytest append files directly', () => {
    expect(
      withTestFiles({ cmd: 'npx', args: ['vitest', 'run'], runner: 'vitest', language: 'js' }, ['x.test.ts']).args,
    ).toEqual(['vitest', 'run', 'x.test.ts'])
    expect(
      withTestFiles({ cmd: 'python', args: ['-m', 'pytest'], runner: 'pytest', language: 'python' }, ['t_x.py']).args,
    ).toEqual(['-m', 'pytest', 't_x.py'])
  })

  it('non-targetable runners (cargo/go) ignore files and run the whole suite', () => {
    expect(
      withTestFiles({ cmd: 'cargo', args: ['test'], runner: 'cargo', language: 'rust' }, ['anything']).args,
    ).toEqual(['test'])
  })

  it('no files → command unchanged', () => {
    expect(withTestFiles({ cmd: 'go', args: ['test', './...'], runner: 'go', language: 'go' }, [])).toEqual({
      cmd: 'go',
      args: ['test', './...'],
    })
  })
})
