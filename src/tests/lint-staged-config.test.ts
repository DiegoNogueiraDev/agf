import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const projectRoot = resolve(import.meta.dirname, '../..')

function readLintStaged(): Record<string, string[]> {
  return JSON.parse(readFileSync(resolve(projectRoot, '.lintstagedrc.json'), 'utf-8')) as Record<string, string[]>
}

// node_98e96f1a9ed0 — este teste ficou stale após o commit 31e36901
// (fix(hooks): lint-staged sem vitest related): `vitest related --run` foi
// REMOVIDO do pre-commit de propósito — ele reprovava testes que exercitam
// fluxos git enquanto a árvore está stasheada. A cobertura migrou para o
// pre-push (`bun run test:blast:push`). O teste agora guarda ESSA decisão.
describe('lint-staged config', () => {
  it('config file exists as JSON format', () => {
    expect(readLintStaged()).toBeDefined()
  })

  it('runs eslint --fix on staged .ts files', () => {
    expect(readLintStaged()['*.ts']).toContain('eslint --fix')
  })

  it('does NOT run vitest in pre-commit (moved to pre-push, commit 31e36901)', () => {
    // Guard vivo da decisão: o pre-commit valida FORMA (lint); os testes rodam no
    // pre-push por range commitado (árvore estável). Reintroduzir vitest aqui
    // regride o bug que o 31e36901 corrigiu.
    expect(readLintStaged()['*.ts']).not.toContain('vitest related --run')
  })

  it('lint-staged is configured as a valid JSON file with at least the lint step', () => {
    const config = readLintStaged()
    expect(typeof config).toBe('object')
    expect(Array.isArray(config['*.ts'])).toBe(true)
    expect(config['*.ts'].length).toBeGreaterThanOrEqual(1)
  })
})
