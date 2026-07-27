import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SCHEMAS_DIR = join(import.meta.dirname, '../schemas')

describe('Layer constraints: schemas/ must not import from core/', () => {
  const files = ['guardian-hooks.schema.ts', 'agent-role.schema.ts']

  for (const file of files) {
    it(`${file} has no imports from ../core/`, () => {
      const content = readFileSync(join(SCHEMAS_DIR, file), 'utf-8')
      const coreImports = content.match(/from ['"]\.\.\/core\//g)
      expect(coreImports, `${file} must not import from ../core/ (violates dependency_direction)`).toBeNull()
    })
  }
})
