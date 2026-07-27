/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * store-not-found-error — classify a missing `workflow-graph/graph.db` under
 * `requireExisting` so the CLI can fail loud instead of a silent process.exit.
 *
 * WHY: openStoreOrFail(dir, {requireExisting:true}) used to call
 * log.error + process.exit(1) directly. Under piped/redirected stdio,
 * --quiet auto-activates and swallows the log.error, so a caller sees zero
 * output on both stdout and stderr — indistinguishable from a hang. This
 * mirrors the STORE_LOCKED fix (core/store/lock-error.ts): throw a
 * classifiable error and let the entrypoint's fatal envelope stamp the
 * documented STORE_NOT_FOUND code (.claude/rules/cli.md) instead.
 */

/** The stable envelope `code` a missing store surfaces to callers. */
export const STORE_NOT_FOUND_CODE = 'STORE_NOT_FOUND'

export class StoreNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoreNotFoundError'
  }
}

/** True when `err` is the missing-store error thrown by openStoreOrFail. */
export function isStoreNotFoundError(err: unknown): boolean {
  return err instanceof StoreNotFoundError
}
