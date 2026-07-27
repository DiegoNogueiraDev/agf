/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { resolveQualityCommandsFromInput, type QualityInput } from '../core/runner/resolve-quality-commands.js'

const q = (i: QualityInput) => resolveQualityCommandsFromInput(i)

describe('resolveQualityCommandsFromInput — typecheck/lint per language', () => {
  it('TypeScript: tsconfig → tsc --noEmit; eslint config → eslint', () => {
    const out = q({ files: ['package.json', 'tsconfig.json', 'eslint.config.js'] })
    expect(out.typecheck).toMatchObject({ cmd: 'npx', args: ['tsc', '--noEmit'] })
    expect(out.lint?.args[0]).toBe('eslint')
  })

  it('JS without tsconfig has no typecheck', () => {
    expect(q({ files: ['package.json'] }).typecheck).toBeUndefined()
  })

  it('Rust: cargo check + cargo clippy', () => {
    const out = q({ files: ['Cargo.toml'] })
    expect(out.typecheck).toMatchObject({ cmd: 'cargo', args: ['check'] })
    expect(out.lint).toMatchObject({ cmd: 'cargo', args: ['clippy'] })
  })

  it('Go: go vet ./... as the typecheck/lint', () => {
    expect(q({ files: ['go.mod'] }).typecheck).toMatchObject({ cmd: 'go', args: ['vet', './...'] })
  })

  it('Python: mypy + ruff when configured', () => {
    const out = q({ files: ['pyproject.toml', 'mypy.ini', 'ruff.toml'] })
    expect(out.typecheck).toMatchObject({ cmd: 'mypy' })
    expect(out.lint).toMatchObject({ cmd: 'ruff' })
  })

  it('returns an empty object when nothing is detected', () => {
    expect(q({ files: ['README.md'] })).toEqual({})
  })
})
