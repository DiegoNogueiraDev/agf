/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * store-corrupt-error — classify a corrupt `workflow-graph/graph.db`
 * (SQLITE_NOTADB / SQLITE_CORRUPT) so the CLI can fail loud instead of a
 * silent process.exit.
 *
 * WHY: openStoreOrFail's catch branch called log.error + process.exit(1)
 * directly on a corrupt DB. Under piped/redirected stdio, --quiet
 * auto-activates and swallows the log.error, so a caller sees zero output on
 * both stdout and stderr — indistinguishable from a hang. Mirrors the
 * STORE_NOT_FOUND (store-not-found-error.ts) and STORE_LOCKED
 * (lock-error.ts) fixes: throw a classifiable error and let the entrypoint's
 * fatal envelope stamp the documented STORE_CORRUPT code instead.
 */

/** The stable envelope `code` a corrupt store surfaces to callers. */
export const STORE_CORRUPT_CODE = 'STORE_CORRUPT'

export class StoreCorruptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoreCorruptError'
  }
}

/** True when `err` is the corrupt-store error thrown by openStoreOrFail. */
export function isStoreCorruptError(err: unknown): boolean {
  return err instanceof StoreCorruptError
}
