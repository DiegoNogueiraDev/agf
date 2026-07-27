import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'

const projectRoot = resolve(import.meta.dirname, '../..')

function readHook(name: string): string {
  return readFileSync(resolve(projectRoot, '.husky', name), 'utf-8')
}

describe('husky git hooks setup', () => {
  it('pre-commit hook exists with lint-staged and typecheck', () => {
    const content = readHook('pre-commit')
    expect(content).toContain('lint-staged')
    expect(content).toContain('typecheck')
  })

  it('commit-msg hook exists with commitlint', () => {
    const content = readHook('commit-msg')
    expect(content).toContain('commitlint')
  })

  it('package.json has prepare script for husky auto-install', () => {
    const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'))
    expect(pkg.scripts).toHaveProperty('prepare', 'husky')
  })

  it('git hooksPath points to .husky/_', () => {
    const hooksPath = execSync('git config core.hooksPath', { encoding: 'utf-8' }).trim()
    expect(hooksPath).toBe('.husky/_')
  })
})
