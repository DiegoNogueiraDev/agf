import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listConstitutionLines, constitutionCommand, checkConstitutionDrift } from '../cli/commands/constitution-cmd.js'

describe('listConstitutionLines', () => {
  it('returns an array', () => {
    const lines = listConstitutionLines()
    expect(Array.isArray(lines)).toBe(true)
  })

  it('all entries are strings', () => {
    const lines = listConstitutionLines()
    for (const line of lines) {
      expect(typeof line).toBe('string')
    }
  })
})

describe('constitutionCommand', () => {
  it('returns a Command instance', () => {
    const cmd = constitutionCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = constitutionCommand()
    expect(cmd.name()).toBe('constitution')
  })

  it('has a non-empty description', () => {
    const cmd = constitutionCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

describe('checkConstitutionDrift', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('reports no drift when vendor and rules files match', () => {
    dir = mkdtempSync(join(tmpdir(), 'constitution-drift-'))
    const vendorPath = join(dir, 'vendor.md')
    const rulesPath = join(dir, 'rules.md')
    writeFileSync(vendorPath, '## Section A\nbody')
    writeFileSync(rulesPath, '## Section A\nbody')

    const result = checkConstitutionDrift(vendorPath, rulesPath)

    expect(result.addedInVendor).toEqual([])
    expect(result.removedFromRules).toEqual([])
    expect(result.modified).toEqual([])
  })

  it('detects a section added upstream that the local rules file is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'constitution-drift-'))
    const vendorPath = join(dir, 'vendor.md')
    const rulesPath = join(dir, 'rules.md')
    writeFileSync(vendorPath, '## Section A\nbody\n## Section B\nbody')
    writeFileSync(rulesPath, '## Section A\nbody')

    const result = checkConstitutionDrift(vendorPath, rulesPath)

    expect(result.addedInVendor).toContain('Section B')
  })
})
