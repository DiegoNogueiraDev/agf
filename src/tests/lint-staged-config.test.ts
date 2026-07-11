import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const projectRoot = resolve(import.meta.dirname, '../..')

describe('lint-staged config', () => {
  it('config file exists as JSON format', () => {
    const config = JSON.parse(readFileSync(resolve(projectRoot, '.lintstagedrc.json'), 'utf-8'))
    expect(config).toBeDefined()
  })

  it('runs eslint --fix on staged .ts files', () => {
    const config = JSON.parse(readFileSync(resolve(projectRoot, '.lintstagedrc.json'), 'utf-8'))
    expect(config['*.ts']).toContain('eslint --fix')
  })

  it('runs vitest related --run on staged .ts files', () => {
    const config = JSON.parse(readFileSync(resolve(projectRoot, '.lintstagedrc.json'), 'utf-8'))
    expect(config['*.ts']).toContain('vitest related --run')
  })

  it('lint-staged is configured as a valid JSON file', () => {
    const config = JSON.parse(readFileSync(resolve(projectRoot, '.lintstagedrc.json'), 'utf-8'))
    expect(typeof config).toBe('object')
    expect(Array.isArray(config['*.ts'])).toBe(true)
    expect(config['*.ts'].length).toBeGreaterThanOrEqual(2)
  })
})
