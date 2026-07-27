import { describe, it, expect } from 'vitest'
import { parseSpecialPath, isBuiltInProfile, BUILT_IN_PROFILE_NAMES } from '../schemas/permissions-profile.schema.js'

describe('parseSpecialPath', () => {
  it('returns null for a normal path', () => {
    expect(parseSpecialPath('/home/user')).toBeNull()
    expect(parseSpecialPath('relative/path')).toBeNull()
  })

  it('maps :root to Root', () => {
    expect(parseSpecialPath(':root')).toBe('Root')
  })

  it('maps :workspace_roots to ProjectRoots', () => {
    expect(parseSpecialPath(':workspace_roots')).toBe('ProjectRoots')
  })

  it('maps :tmpdir to Tmpdir', () => {
    expect(parseSpecialPath(':tmpdir')).toBe('Tmpdir')
  })

  it('returns null for unknown colon-prefix', () => {
    expect(parseSpecialPath(':unknown_special')).toBeNull()
  })
})

describe('isBuiltInProfile', () => {
  it('returns true for built-in profile names', () => {
    for (const name of BUILT_IN_PROFILE_NAMES) {
      expect(isBuiltInProfile(name)).toBe(true)
    }
  })

  it('returns false for unknown profile name', () => {
    expect(isBuiltInProfile('custom-profile')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isBuiltInProfile('')).toBe(false)
  })
})
