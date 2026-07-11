/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Language-agnostic typecheck/lint command resolver — the quality-gate sibling
 * of resolve-test-command.ts. Given a project's marker files, returns the
 * typecheck and lint commands for its stack so `agf done --gates` can run them
 * portably (any language) instead of assuming a TS toolchain.
 *
 * A gate whose tool is absent is reported as `undefined` (skipped with a warning
 * by the caller) — never a hard failure for projects that don't lint/typecheck.
 */

import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { ResolvedCommand } from './resolve-test-command.js'

export interface QualityCommands {
  typecheck?: ResolvedCommand
  lint?: ResolvedCommand
}

export interface QualityInput {
  files?: string[]
}

function has(files: string[], name: string): boolean {
  return files.includes(name)
}

const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
]

/** Resolve typecheck + lint commands from plain marker-file signals (pure). */
export function resolveQualityCommandsFromInput(input: QualityInput): QualityCommands {
  const files = input.files ?? []
  const out: QualityCommands = {}

  // ── JavaScript / TypeScript ──────────────────────────────────────────────
  if (has(files, 'package.json')) {
    if (has(files, 'tsconfig.json') || has(files, 'tsconfig.base.json')) {
      out.typecheck = { cmd: 'npx', args: ['tsc', '--noEmit'], runner: 'tsc', language: 'js' }
    }
    if (ESLINT_CONFIGS.some((c) => has(files, c))) {
      out.lint = { cmd: 'npx', args: ['eslint', '.'], runner: 'eslint', language: 'js' }
    }
    if (out.typecheck || out.lint) return out
  }

  // ── Rust ─────────────────────────────────────────────────────────────────
  if (has(files, 'Cargo.toml')) {
    out.typecheck = { cmd: 'cargo', args: ['check'], runner: 'cargo-check', language: 'rust' }
    out.lint = { cmd: 'cargo', args: ['clippy'], runner: 'clippy', language: 'rust' }
    return out
  }

  // ── Go ───────────────────────────────────────────────────────────────────
  if (has(files, 'go.mod')) {
    out.typecheck = { cmd: 'go', args: ['vet', './...'], runner: 'go-vet', language: 'go' }
    return out
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'].some((f) => has(files, f))) {
    if (has(files, 'mypy.ini') || has(files, 'pyproject.toml')) {
      out.typecheck = { cmd: 'mypy', args: ['.'], runner: 'mypy', language: 'python' }
    }
    if (has(files, 'ruff.toml') || has(files, '.ruff.toml')) {
      out.lint = { cmd: 'ruff', args: ['check', '.'], runner: 'ruff', language: 'python' }
    }
    return out
  }

  return out
}

const MARKER_FILES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  ...ESLINT_CONFIGS,
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'mypy.ini',
  'ruff.toml',
  '.ruff.toml',
]

/** Gather marker files for `dir` and resolve its quality commands. */
export function resolveQualityCommands(dir: string): QualityCommands {
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    /* unreadable dir */
  }
  const files = MARKER_FILES.filter((f) => existsSync(path.join(dir, f)))
  // include any config picked up by readdir not in the static list
  for (const e of entries) if (!files.includes(e) && MARKER_FILES.includes(e)) files.push(e)
  return resolveQualityCommandsFromInput({ files })
}
