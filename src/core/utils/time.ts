/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/** Return the current timestamp as an ISO 8601 string. */
export function now(): string {
  return new Date().toISOString()
}
