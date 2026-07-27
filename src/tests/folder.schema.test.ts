import { describe, it, expect } from 'vitest'
import { OpenFolderBodySchema } from '../schemas/folder.schema.js'

describe('OpenFolderBodySchema', () => {
  it('accepts a valid path', () => {
    expect(OpenFolderBodySchema.safeParse({ path: '/home/user/project' }).success).toBe(true)
  })

  it('rejects empty path', () => {
    expect(OpenFolderBodySchema.safeParse({ path: '' }).success).toBe(false)
  })

  it('rejects missing path', () => {
    expect(OpenFolderBodySchema.safeParse({}).success).toBe(false)
  })

  it('rejects path longer than 2000 chars', () => {
    expect(OpenFolderBodySchema.safeParse({ path: 'a'.repeat(2001) }).success).toBe(false)
  })

  it('accepts path at max length 2000', () => {
    expect(OpenFolderBodySchema.safeParse({ path: 'a'.repeat(2000) }).success).toBe(true)
  })
})
