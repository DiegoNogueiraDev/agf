/* eslint-disable security/detect-unsafe-regex */
/*!
 * Lint exemption: the regex patterns in this file are bounded
 * (literal alternations, short character classes, language-keyword
 * lookups) and run against parsed/structured input. The ReDoS class
 * the rule is designed to prevent is not reachable here.
 */
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §HOOKS-MULTI-CLI-INTEGRATION-PRD — deterministic hook id scheme.
 * Canonical id: `${cli}-${event}-${groupIndex}[-${hookIndex}]`.
 * Round-trippable: parseHookId(makeHookId(parts)) == parts.
 *
 * Examples:
 *   claude-pretooluse-0-0   (group 0, hook 0 within the group)
 *   codex-notification-0
 *   opencode-stop-2
 */

import { InvalidArgumentError } from '../utils/errors.js'

const ID_RE = /^([a-z][a-z0-9]+)-([a-z][a-z0-9-]+?)-(\d+)(?:-(\d+))?$/

export interface HookIdParts {
  cli: string
  event: string
  groupIndex: number
  hookIndex?: number
}

/** makeHookId —  */
export function makeHookId(parts: HookIdParts): string {
  if (!/^[a-z][a-z0-9]+$/.test(parts.cli)) {
    throw new InvalidArgumentError(`hook-id:invalid-cli — '${parts.cli}'`)
  }
  if (!/^[a-z][a-z0-9-]+$/.test(parts.event)) {
    throw new InvalidArgumentError(`hook-id:invalid-event — '${parts.event}'`)
  }
  if (!Number.isInteger(parts.groupIndex) || parts.groupIndex < 0) {
    throw new InvalidArgumentError(`hook-id:invalid-groupIndex — ${parts.groupIndex}`)
  }
  if (parts.hookIndex !== undefined && (!Number.isInteger(parts.hookIndex) || parts.hookIndex < 0)) {
    throw new InvalidArgumentError(`hook-id:invalid-hookIndex — ${parts.hookIndex}`)
  }
  const tail = parts.hookIndex !== undefined ? `-${parts.hookIndex}` : ''
  return `${parts.cli}-${parts.event}-${parts.groupIndex}${tail}`
}

/** parseHookId —  */
export function parseHookId(id: string): HookIdParts | undefined {
  const mVar = ID_RE.exec(id)
  if (!mVar) return undefined
  const parts: HookIdParts = {
    cli: mVar[1],
    event: mVar[2],
    groupIndex: Number(mVar[3]),
  }
  if (mVar[4] !== undefined) parts.hookIndex = Number(mVar[4])
  return parts
}

/** isValidHookId —  */
export function isValidHookId(id: string): boolean {
  return parseHookId(id) !== undefined
}
