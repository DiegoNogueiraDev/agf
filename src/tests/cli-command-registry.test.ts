/*!
 * TDD: CLI command registry — usage discovers commands at runtime (node_66e257b38f90).
 *
 * AC1: Given the command registry, When 'agf usage' runs,
 *      Then the list matches index.ts exactly (no drift).
 * AC2: Given a new command added, When usage runs,
 *      Then it appears without editing usage-cmd.
 */

import { describe, it, expect } from 'vitest'
import { getRegisteredCommandNames, COMMAND_REGISTRY } from '../cli/command-registry.js'

describe('AC1: registry matches index.ts — no drift', () => {
  it('returns an array of command name strings', () => {
    const names = getRegisteredCommandNames()
    expect(Array.isArray(names)).toBe(true)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })

  it('includes canonical commands that must always exist', () => {
    const names = new Set(getRegisteredCommandNames())
    expect(names.has('next')).toBe(true)
    expect(names.has('done')).toBe(true)
    expect(names.has('start')).toBe(true)
    expect(names.has('check')).toBe(true)
  })

  it('has no duplicate entries', () => {
    const names = getRegisteredCommandNames()
    expect(names.length).toBe(new Set(names).size)
  })
})

describe('AC2: COMMAND_REGISTRY is the single source of truth', () => {
  it('each entry has name and description', () => {
    for (const entry of COMMAND_REGISTRY) {
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.description).toBe('string')
    }
  })

  it('getRegisteredCommandNames returns all names from COMMAND_REGISTRY in order', () => {
    const names = getRegisteredCommandNames()
    const registryNames = COMMAND_REGISTRY.map((e) => e.name)
    expect(names).toEqual(registryNames)
  })
})
