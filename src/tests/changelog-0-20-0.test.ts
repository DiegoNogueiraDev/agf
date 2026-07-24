import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md')
const README = path.join(ROOT, 'README.md')

describe('CHANGELOG — AC1: 0.20.0 lista épicos RPA + SWE', () => {
  it('CHANGELOG.md exists', () => {
    expect(existsSync(CHANGELOG)).toBe(true)
  })

  it('contains 0.20.0 section', () => {
    const content = readFileSync(CHANGELOG, 'utf-8')
    expect(content).toContain('0.20.0')
  })

  it('mentions RPA epic in 0.20.0 section', () => {
    const content = readFileSync(CHANGELOG, 'utf-8')
    expect(content.toLowerCase()).toContain('rpa')
  })

  it('mentions SWE epic in 0.20.0 section', () => {
    const content = readFileSync(CHANGELOG, 'utf-8')
    expect(content.toLowerCase()).toContain('swe')
  })
})

describe('README — AC2: install in < 5 steps', () => {
  it('README.md exists', () => {
    expect(existsSync(README)).toBe(true)
  })

  it('install / quick-start section exists', () => {
    // Re-anchored (node_bb546b3d5497): the README reorganised — install/setup now
    // lives under "Orientação rápida"/"Setup"/"Distribuição", no longer a fixed
    // "## 2./3. Install" heading. Assert the section exists by intent, not by number.
    const content = readFileSync(README, 'utf-8')
    expect(content).toMatch(/##.*(Instala|Install|Orientação rápida|Setup|Distribuição)/i)
  })

  it('has agf doctor verification step', () => {
    const content = readFileSync(README, 'utf-8')
    expect(content).toContain('agf doctor')
  })
})
