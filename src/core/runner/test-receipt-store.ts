/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Ledger of real test-gate runs. A receipt (canonical hash from
 * execute-test-gate.ts) is recorded here only when the gate actually ran; the
 * provenance `validated` tier checks this ledger so a node cannot be promoted
 * against a fabricated test_run_id. The teeth behind "tests actually passed".
 */

import type Database from 'better-sqlite3'

export interface TestReceiptEntry {
  receipt: string
  nodeId?: string | null
  runner?: string | null
  exitCode?: number | null
  passed: boolean
}

/** Record a test-gate receipt. Idempotent on the receipt hash (PK). */
export function recordTestReceipt(db: Database.Database, entry: TestReceiptEntry): void {
  db.prepare(
    `INSERT OR IGNORE INTO test_run_receipts (receipt, node_id, runner, exit_code, passed, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.receipt,
    entry.nodeId ?? null,
    entry.runner ?? null,
    entry.exitCode ?? null,
    entry.passed ? 1 : 0,
    Date.now(),
  )
}

/** True only when a PASSING receipt with this hash exists — valid promotion evidence. */
export function testReceiptExists(db: Database.Database, receipt: string): boolean {
  const row = db.prepare(`SELECT 1 FROM test_run_receipts WHERE receipt = ? AND passed = 1 LIMIT 1`).get(receipt)
  return row !== undefined
}
