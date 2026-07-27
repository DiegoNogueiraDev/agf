/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { randomBytes } from 'node:crypto'

/** Generate a cryptographically random ID with the given prefix (e.g. "node_a1b2c3"). */
export function generateId(prefix: string = 'node'): string {
  const hex = randomBytes(6).toString('hex')
  return `${prefix}_${hex}`
}
