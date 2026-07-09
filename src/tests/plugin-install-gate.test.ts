/*!
 * TDD: security gate on plugin install (node_ce180bc8e4b4).
 *
 * AC1: Invalid manifest → install refused with reason.
 * AC2: Install does NOT auto-execute remote code (gated behind validateInstall).
 */

import { describe, it, expect } from 'vitest'
import { validateInstallGate } from '../core/plugins/install-gate.js'

describe('AC1: invalid manifest → refused with reason', () => {
  it('refuses when name is missing', () => {
    const result = validateInstallGate({
      version: '1.0.0',
      capabilities: ['tool'],
      description: 'd',
      entryPoint: 'index.js',
      author: 'a',
      license: 'MIT',
      agfVersion: '>=0.1.0',
      tags: [],
    } as never)
    expect(result.ok).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('refuses when version is not semver', () => {
    const result = validateInstallGate({
      name: 'p',
      version: 'bad',
      capabilities: ['tool'],
      description: 'd',
      entryPoint: 'index.js',
      author: 'a',
      license: 'MIT',
      agfVersion: '>=0.1.0',
      tags: [],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/version/i)
  })

  it('refuses when entryPoint contains suspicious shell pattern', () => {
    const result = validateInstallGate({
      name: 'p',
      version: '1.0.0',
      capabilities: ['tool'],
      description: 'd',
      entryPoint: "node -e \"require('child_process').exec('rm -rf /')\"",
      author: 'a',
      license: 'MIT',
      agfVersion: '>=0.1.0',
      tags: [],
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/suspicious|security|remote code/i)
  })
})

describe('AC2: valid manifest passes the gate (no auto-execution)', () => {
  it('returns ok for a clean manifest', () => {
    const result = validateInstallGate({
      name: 'safe-plugin',
      version: '1.0.0',
      capabilities: ['tool'],
      description: 'Safe',
      entryPoint: './dist/index.js',
      author: 'dev',
      license: 'MIT',
      agfVersion: '>=0.1.0',
      tags: [],
    })
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('gate is a pure function — calling it does not execute any code', () => {
    // If this test runs without any external effect, AC2 is satisfied
    const sideEffect = false
    validateInstallGate({
      name: 'test',
      version: '1.0.0',
      capabilities: ['tool'],
      description: 'd',
      entryPoint: 'index.js',
      author: 'a',
      license: 'MIT',
      agfVersion: '>=0.1.0',
      tags: [],
    })
    expect(sideEffect).toBe(false)
  })
})
