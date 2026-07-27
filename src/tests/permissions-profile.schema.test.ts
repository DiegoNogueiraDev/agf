import { describe, it, expect } from 'vitest'
import {
  WorkspaceRootEntrySchema,
  PermissionProfileTomlSchema,
  isBuiltInProfile,
  BUILT_IN_PROFILE_NAMES,
} from '../schemas/permissions-profile.schema.js'

describe('WorkspaceRootEntrySchema', () => {
  it('accepts a read entry', () => {
    expect(
      WorkspaceRootEntrySchema.safeParse({
        path: '/home/user/project',
        access: 'Read',
      }).success,
    ).toBe(true)
  })

  it('accepts a write entry', () => {
    expect(
      WorkspaceRootEntrySchema.safeParse({
        path: '/tmp/output',
        access: 'Write',
      }).success,
    ).toBe(true)
  })

  it('rejects empty path', () => {
    expect(WorkspaceRootEntrySchema.safeParse({ path: '', access: 'Read' }).success).toBe(false)
  })
})

describe('PermissionProfileTomlSchema', () => {
  const VALID_PROFILE = {
    filesystem: { kind: 'Restricted' },
    network: { kind: 'Restricted' },
  }

  it('accepts a restricted profile', () => {
    expect(PermissionProfileTomlSchema.safeParse(VALID_PROFILE).success).toBe(true)
  })

  it('accepts profile with extends', () => {
    expect(
      PermissionProfileTomlSchema.safeParse({
        ...VALID_PROFILE,
        extends: ':workspace',
        filesystem: { kind: 'Unrestricted' },
      }).success,
    ).toBe(true)
  })
})

describe('isBuiltInProfile', () => {
  it('returns true for built-in profiles', () => {
    for (const name of BUILT_IN_PROFILE_NAMES) {
      expect(isBuiltInProfile(name)).toBe(true)
    }
  })

  it('returns false for unknown profile', () => {
    expect(isBuiltInProfile('custom-profile')).toBe(false)
  })
})
