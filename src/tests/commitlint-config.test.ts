import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

const projectRoot = resolve(import.meta.dirname, '../..')

describe('commitlint config', () => {
  it('commitlint.config.js exists with @commitlint/config-conventional', () => {
    const content = readFileSync(resolve(projectRoot, 'commitlint.config.js'), 'utf-8')
    expect(content).toContain('@commitlint/config-conventional')
  })

  it('custom scopes defined: cli, core, graph, hooks, events, plugins, approval, tests, ci, docs', () => {
    const content = readFileSync(resolve(projectRoot, 'commitlint.config.js'), 'utf-8')
    const expectedScopes = ['cli', 'core', 'graph', 'hooks', 'events', 'plugins', 'approval', 'tests', 'ci', 'docs']
    for (const scope of expectedScopes) {
      expect(content).toContain(scope)
    }
  })

  it('commit without conventional format is rejected', () => {
    try {
      execSync('echo "bad commit message" | npx commitlint', {
        cwd: projectRoot,
        encoding: 'utf-8',
      })
      expect.fail('should have thrown')
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; status?: number }
      const output = [err.stdout, err.stderr].filter(Boolean).join('')
      expect(output).toContain('problems')
      expect(err.status).toBe(1)
    }
  })

  it('commit with valid format (feat(core): ...) passes', () => {
    const result = execSync('echo "feat(core): add new feature" | npx commitlint', {
      cwd: projectRoot,
      encoding: 'utf-8',
    })
    expect(result).toBeDefined()
  })
})
