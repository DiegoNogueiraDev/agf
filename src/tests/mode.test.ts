import { describe, it, expect } from 'vitest'
import { DEFAULT_PERMISSION_MODE } from '../core/permissions/mode.js'

describe('DEFAULT_PERMISSION_MODE', () => {
  it('is a string constant', () => {
    expect(typeof DEFAULT_PERMISSION_MODE).toBe('string')
  })

  it('equals workspace-write', () => {
    expect(DEFAULT_PERMISSION_MODE).toBe('workspace-write')
  })
})
