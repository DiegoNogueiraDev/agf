import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

const projectRoot = resolve(import.meta.dirname, '../..')

describe('Makefile', () => {
  it('make help lists all targets with descriptions', () => {
    const output = execSync('make help', { cwd: projectRoot, encoding: 'utf-8' })
    expect(output).toContain('help')
    expect(output).toContain('format')
    expect(output).toContain('check')
    expect(output).toContain('test')
    expect(output).toContain('build')
    expect(output).toContain('clean')
  })

  it('Makefile uses .PHONY declarations', () => {
    const content = readFileSync(resolve(projectRoot, 'Makefile'), 'utf-8')
    const phonyLines = content.match(/\.PHONY:.*/g) ?? []
    expect(phonyLines.length).toBeGreaterThanOrEqual(10)
  })

  it('Makefile targets have ## doc comments for help', () => {
    const content = readFileSync(resolve(projectRoot, 'Makefile'), 'utf-8')
    const commentedTargets = content.match(/^[a-z_-]+:.*## /gm) ?? []
    expect(commentedTargets.length).toBeGreaterThanOrEqual(10)
  })

  it('make format runs eslint --fix', () => {
    const content = readFileSync(resolve(projectRoot, 'Makefile'), 'utf-8')
    expect(content).toContain('eslint --fix')
  })

  it('make check runs eslint + typecheck', () => {
    const content = readFileSync(resolve(projectRoot, 'Makefile'), 'utf-8')
    expect(content).toContain('eslint')
    expect(content).toContain('typecheck')
  })

  it('make test runs vitest', () => {
    const content = readFileSync(resolve(projectRoot, 'Makefile'), 'utf-8')
    expect(content).toContain('vitest')
  })

  it('make build runs the bun build', () => {
    const content = readFileSync(resolve(projectRoot, 'Makefile'), 'utf-8')
    expect(content).toContain('bun run build')
  })
})
