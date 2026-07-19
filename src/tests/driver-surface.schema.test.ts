/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod/v4'
import { DRIVER_SURFACES, DriverSurfaceSchema } from '../schemas/driver-surface.schema.js'

describe('DriverSurfaceSchema', () => {
  it('aceita as 5 superficies canonicas', () => {
    for (const s of DRIVER_SURFACES) {
      expect(DriverSurfaceSchema.parse(s)).toBe(s)
    }
  })

  it('rejeita valor fora do enum com ZodError', () => {
    expect(() => DriverSurfaceSchema.parse('warp')).toThrowError(ZodError)
  })

  it('rejeita tipo errado (numero) com ZodError', () => {
    expect(() => DriverSurfaceSchema.parse(7)).toThrowError(ZodError)
  })
})
