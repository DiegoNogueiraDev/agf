/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Language-agnostic test-command resolver. Given a project's marker files +
 * package metadata, returns the command that runs its test suite — for ANY
 * stack (JS, Python, Go, Rust, Java, Ruby, PHP, .NET, Elixir).
 *
 * The pure core `resolveTestCommandFromInput` consumes plain signals (no I/O),
 * so it is exhaustively unit-testable; the thin `resolveTestCommand(dir)`
 * gathers those signals from the filesystem. This is the foundation that lets
 * `agf done`/`submit` and the DoD `tests_green` gate run the RIGHT runner for
 * the target project instead of a hardcoded `vitest`.
 *
 * Expands the stack signals already detected by detectProjectContext()
 * (ai-memory-generator.ts) into an executable command.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export interface ResolvedCommand {
  cmd: string
  args: string[]
  /** Runner id: vitest | jest | mocha | npm-script | pytest | cargo | go | maven | gradle | rspec | phpunit | composer-script | dotnet | mix | custom */
  runner: string
  language: string
}

/** Plain, I/O-free signals the pure resolver consumes — injectable for tests. */
export interface ResolveInput {
  /** Explicit override (e.g. --test-cmd). Wins over all detection. */
  explicit?: string | null
  /** Top-level marker file names present in the project (e.g. 'package.json', 'Cargo.toml'). */
  files?: string[]
  /** package.json (or composer.json) scripts map. */
  pkgScripts?: Record<string, string>
  /** Merged dependencies + devDependencies. */
  pkgDeps?: Record<string, string>
}

const NPM_PLACEHOLDER = /no test specified/i

/** Split an explicit command string into cmd + args (simple whitespace split). */
function splitCommand(raw: string): { cmd: string; args: string[] } {
  const parts = raw.trim().split(/\s+/)
  return { cmd: parts[0] ?? '', args: parts.slice(1) }
}

function has(files: string[], name: string): boolean {
  return files.includes(name)
}

function hasSuffix(files: string[], suffix: string): boolean {
  return files.some((f) => f.endsWith(suffix))
}

/**
 * Resolve the test command from plain signals. Precedence: explicit override >
 * a real JS `test` script > framework/stack detection. Returns null when no
 * test signal is present.
 */
export function resolveTestCommandFromInput(input: ResolveInput): ResolvedCommand | null {
  const files = input.files ?? []
  const scripts = input.pkgScripts ?? {}
  const deps = input.pkgDeps ?? {}

  if (input.explicit && input.explicit.trim().length > 0) {
    const { cmd, args } = splitCommand(input.explicit)
    return { cmd, args, runner: 'custom', language: 'custom' }
  }

  // ── JavaScript / TypeScript ──────────────────────────────────────────────
  if (has(files, 'package.json')) {
    // Prefer test:blast (affected tests only) over full suite to avoid false
    // TESTS_FAILED from large verbose output (node_6cdaad0b6a55 regression fix).
    if (scripts['test:blast']) {
      return { cmd: 'npm', args: ['run', 'test:blast'], runner: 'npm-script', language: 'js' }
    }
    const testScript = scripts.test
    if (testScript && !NPM_PLACEHOLDER.test(testScript)) {
      return { cmd: 'npm', args: ['test'], runner: 'npm-script', language: 'js' }
    }
    if (deps.vitest) return { cmd: 'npx', args: ['vitest', 'run'], runner: 'vitest', language: 'js' }
    if (deps.jest) return { cmd: 'npx', args: ['jest'], runner: 'jest', language: 'js' }
    if (deps.mocha) return { cmd: 'npx', args: ['mocha'], runner: 'mocha', language: 'js' }
    // package.json but no recognizable test wiring — fall through to other stacks.
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (
    ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'tox.ini'].some((f) => has(files, f))
  ) {
    return { cmd: 'python', args: ['-m', 'pytest'], runner: 'pytest', language: 'python' }
  }

  // ── Rust ─────────────────────────────────────────────────────────────────
  if (has(files, 'Cargo.toml')) {
    return { cmd: 'cargo', args: ['test'], runner: 'cargo', language: 'rust' }
  }

  // ── Go ───────────────────────────────────────────────────────────────────
  if (has(files, 'go.mod')) {
    return { cmd: 'go', args: ['test', './...'], runner: 'go', language: 'go' }
  }

  // ── Java / JVM ───────────────────────────────────────────────────────────
  if (has(files, 'pom.xml')) {
    return { cmd: 'mvn', args: ['test'], runner: 'maven', language: 'java' }
  }
  if (has(files, 'build.gradle') || has(files, 'build.gradle.kts')) {
    const cmd = has(files, 'gradlew') ? './gradlew' : 'gradle'
    return { cmd, args: ['test'], runner: 'gradle', language: 'java' }
  }

  // ── Ruby ─────────────────────────────────────────────────────────────────
  if (has(files, 'Gemfile')) {
    if (has(files, '.rspec') || hasSuffix(files, '_spec.rb')) {
      return { cmd: 'bundle', args: ['exec', 'rspec'], runner: 'rspec', language: 'ruby' }
    }
    return { cmd: 'bundle', args: ['exec', 'rake', 'test'], runner: 'rake', language: 'ruby' }
  }

  // ── PHP ──────────────────────────────────────────────────────────────────
  if (has(files, 'composer.json')) {
    if (scripts.test) {
      return { cmd: 'composer', args: ['test'], runner: 'composer-script', language: 'php' }
    }
    return { cmd: 'vendor/bin/phpunit', args: [], runner: 'phpunit', language: 'php' }
  }

  // ── .NET ─────────────────────────────────────────────────────────────────
  if (hasSuffix(files, '.csproj') || hasSuffix(files, '.sln') || hasSuffix(files, '.fsproj')) {
    return { cmd: 'dotnet', args: ['test'], runner: 'dotnet', language: 'dotnet' }
  }

  // ── Elixir ───────────────────────────────────────────────────────────────
  if (has(files, 'mix.exs')) {
    return { cmd: 'mix', args: ['test'], runner: 'mix', language: 'elixir' }
  }

  return null
}

/** Runners that accept individual test-file paths as positional args. */
const TARGETABLE = new Set(['vitest', 'jest', 'mocha', 'pytest'])

/**
 * Append specific test files to a resolved command for a targeted (fast) run.
 * npm/composer scripts forward files after `--`; framework runners take them
 * directly; runners that don't address files (cargo, go, maven…) run the whole
 * suite. Pure — used by `agf done`/`submit` to keep targeted runs portable.
 */
export function withTestFiles(resolved: ResolvedCommand, testFiles: string[]): { cmd: string; args: string[] } {
  if (testFiles.length === 0) return { cmd: resolved.cmd, args: resolved.args }
  const args = [...resolved.args]
  if (resolved.runner === 'npm-script' || resolved.runner === 'composer-script') args.push('--', ...testFiles)
  else if (TARGETABLE.has(resolved.runner)) args.push(...testFiles)
  return { cmd: resolved.cmd, args }
}

const MARKER_FILES = [
  'package.json',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'Pipfile',
  'tox.ini',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'gradlew',
  'Gemfile',
  '.rspec',
  'composer.json',
  'phpunit.xml',
  'mix.exs',
]

/**
 * Find the nearest ancestor directory (strictly between the first testFile
 * and `baseDir`, exclusive of `baseDir`) that owns a package.json — a
 * monorepo sub-package root. Returns null when the test file is directly
 * within `baseDir`'s own package (no sub-package boundary crossed).
 */
function findSubPackageRoot(baseDir: string, testFileRelPath: string): string | null {
  const normalizedBase = path.resolve(baseDir)
  let dir = path.dirname(path.resolve(baseDir, testFileRelPath))

  while (dir !== normalizedBase && dir.startsWith(normalizedBase + path.sep)) {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Resolve the test command AND its correct working directory, inferred from
 * the first testFile's path. In a monorepo, `--test-cmd` running from the
 * root fails against a sub-package's own testFiles (e.g. `frontend/`) — the
 * command must run FROM that subdirectory, with test paths relative to it.
 * An explicit override skips inference entirely (the caller already knows
 * what they want to run and from where).
 */
export function resolveTestCommandForFiles(
  dir: string,
  testFiles: string[],
  opts: { explicit?: string | null } = {},
): { resolved: ResolvedCommand; cwd: string; testFiles: string[] } | null {
  if (opts.explicit) {
    const resolved = resolveTestCommand(dir, opts)
    return resolved ? { resolved, cwd: dir, testFiles } : null
  }

  const subRoot = testFiles.length > 0 ? findSubPackageRoot(dir, testFiles[0]) : null
  if (!subRoot) {
    const resolved = resolveTestCommand(dir, opts)
    return resolved ? { resolved, cwd: dir, testFiles } : null
  }

  const resolved = resolveTestCommand(subRoot, opts)
  if (!resolved) return null
  const relativeTestFiles = testFiles.map((f) => path.relative(subRoot, path.resolve(dir, f)))
  return { resolved, cwd: subRoot, testFiles: relativeTestFiles }
}

/** Gather filesystem signals for `dir` and resolve the test command. */
export function resolveTestCommand(dir: string, opts: { explicit?: string | null } = {}): ResolvedCommand | null {
  const present = MARKER_FILES.filter((f) => existsSync(path.join(dir, f)))

  // Pick up extension-based markers (.csproj/.sln/.fsproj) from the top level.
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    /* unreadable dir — rely on marker files only */
  }
  const extMarkers = entries.filter((f) => /\.(csproj|sln|fsproj)$/.test(f))
  const files = [...present, ...extMarkers]

  let pkgScripts: Record<string, string> | undefined
  let pkgDeps: Record<string, string> | undefined
  const pkgFile = present.includes('package.json')
    ? 'package.json'
    : present.includes('composer.json')
      ? 'composer.json'
      : null
  if (pkgFile) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, pkgFile), 'utf-8')) as Record<string, unknown>
      pkgScripts = (pkg.scripts ?? {}) as Record<string, string>
      pkgDeps = {
        ...((pkg.dependencies ?? {}) as Record<string, string>),
        ...((pkg.devDependencies ?? {}) as Record<string, string>),
        ...((pkg['require-dev'] ?? {}) as Record<string, string>),
      }
    } catch {
      /* malformed manifest — detection falls back to marker files */
    }
  }

  return resolveTestCommandFromInput({ explicit: opts.explicit, files, pkgScripts, pkgDeps })
}
