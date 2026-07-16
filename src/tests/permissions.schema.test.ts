import { describe, it, expect } from 'vitest'
import { FileSystemAccessModeSchema, FileSystemSandboxKindSchema } from '../schemas/permissions.schema.js'

describe('FileSystemAccessModeSchema', () => {
  it('accepts valid access modes', () => {
    for (const m of ['Read', 'Write', 'Deny']) {
      expect(FileSystemAccessModeSchema.safeParse(m).success).toBe(true)
    }
  })

  it('rejects lowercase mode', () => {
    expect(FileSystemAccessModeSchema.safeParse('read').success).toBe(false)
  })
})

describe('FileSystemSandboxKindSchema', () => {
  it('accepts valid sandbox kinds', () => {
    for (const k of ['Restricted', 'Unrestricted', 'ExternalSandbox']) {
      expect(FileSystemSandboxKindSchema.safeParse(k).success).toBe(true)
    }
  })

  it('rejects unknown kind', () => {
    expect(FileSystemSandboxKindSchema.safeParse('Partial').success).toBe(false)
  })
})
