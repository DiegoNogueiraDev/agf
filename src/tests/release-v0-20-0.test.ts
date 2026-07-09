import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as {
  version: string
  scripts: Record<string, string>
}

describe('release v0.20.0 — AC1: pack:offline produces versioned tgz', () => {
  it('package.json version is at least 0.20.0', () => {
    const [major, minor] = pkg.version.split('.').map(Number)
    expect(major > 0 || (major === 0 && minor >= 20)).toBe(true)
  })

  it('pack:offline script is defined', () => {
    expect(pkg.scripts['pack:offline']).toBeDefined()
  })

  it('scripts/pack-offline.mjs exists', () => {
    expect(existsSync(path.join(ROOT, 'scripts', 'pack-offline.mjs'))).toBe(true)
  })
})

describe('release v0.20.0 — AC2: installer script present for clean install', () => {
  it('scripts/pack-offline.mjs contains install.mjs generation logic', () => {
    const script = readFileSync(path.join(ROOT, 'scripts', 'pack-offline.mjs'), 'utf-8')
    expect(script).toContain('install.mjs')
  })

  it('pack:offline uses node scripts/pack-offline.mjs', () => {
    expect(pkg.scripts['pack:offline']).toContain('pack-offline.mjs')
  })
})
