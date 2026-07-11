/*!
 * TDD: replace raw_throw with typed errors (node_a3d7fd819d49).
 *
 * AC: nfr-ac-injector unknown kind → ValidationError; hooks-add unknown channel → ValidationError.
 */

import { describe, it, expect } from 'vitest'
import { injectNfrAc } from '../core/analyzer/nfr-ac-injector.js'
import { validateHookChannel } from '../cli/commands/hooks-add.js'
import { ValidationError } from '../core/utils/errors.js'

describe('typed errors for invalid inputs', () => {
  it('injectNfrAc throws ValidationError for unknown kind', () => {
    expect(() => injectNfrAc('node_123', 'nonexistent-kind')).toThrowError(ValidationError)
  })

  it('injectNfrAc error message mentions the invalid kind', () => {
    expect(() => injectNfrAc('node_123', 'xyz')).toThrow(/xyz/)
  })

  it('validateHookChannel throws ValidationError for unknown channel', () => {
    expect(() => validateHookChannel('ghost-channel')).toThrowError(ValidationError)
  })

  it('validateHookChannel error message mentions the invalid channel', () => {
    expect(() => validateHookChannel('ghost-channel')).toThrow(/ghost-channel/)
  })
})
