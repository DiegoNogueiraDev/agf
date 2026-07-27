/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * upgrade-error — typed error for the self-update flow's internal throw
 * sites (unsupported platform/arch, malformed BUILDINFO, failed fetch).
 * Every site is already caught by runUpgrade's try/catch and mapped to a
 * discriminated UpgradeResult.code, so this replaces an untyped, generic
 * throw with a classifiable type (coding-style.md).
 */

export class UpgradeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpgradeError'
  }
}

/** True when `err` is an UpgradeError thrown by the self-update flow. */
export function isUpgradeError(err: unknown): err is UpgradeError {
  return err instanceof UpgradeError
}
