/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for the typed error thrown by the self-update flow's internal
 * control-flow throw sites (all caught and mapped to UpgradeResult).
 */
import { describe, it, expect } from 'vitest'
import { UpgradeError, isUpgradeError } from '../core/upgrade/upgrade-error.js'
import { resolveAssetName } from '../core/upgrade/upgrade.js'

describe('UpgradeError', () => {
  it('is a named Error subclass', () => {
    const err = new UpgradeError('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('UpgradeError')
    expect(err.message).toBe('boom')
  })

  it('isUpgradeError narrows only UpgradeError instances', () => {
    expect(isUpgradeError(new UpgradeError('x'))).toBe(true)
    expect(isUpgradeError(new Error('x'))).toBe(false)
    expect(isUpgradeError('x')).toBe(false)
  })
})

describe('resolveAssetName error type', () => {
  it('throws an UpgradeError on an unsupported platform', () => {
    expect(() => resolveAssetName('freebsd', 'x64')).toThrow(UpgradeError)
  })

  it('throws an UpgradeError on an unsupported arch', () => {
    expect(() => resolveAssetName('linux', 'ia32')).toThrow(UpgradeError)
  })
})
