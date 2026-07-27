/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import path, { basename } from 'node:path'
import fs from 'node:fs'

export const DEFAULT_TIMEOUT_MS = 300_000 // 5 minutes
export const DEFAULT_INTERVAL_MS = 500
export const APPROVAL_DIR = '.workflow-approvals'

export class ApprovalTimeoutError extends Error {
  constructor(taskId: string, timeoutMs: number) {
    super(`Approval timeout for task '${taskId}' after ${timeoutMs}ms — no signal file received`)
    this.name = 'ApprovalTimeoutError'
  }
}

export interface SignalFileWatcherOptions {
  taskId: string
  /** Base directory for signal files (default: '.workflow-approvals'). */
  dir?: string
  /** Poll interval in ms (default: 500). */
  intervalMs?: number
  /** Total timeout in ms (default: 300_000 — 5 minutes). */
  timeoutMs?: number
  /** Injectable file reader — defaults to real fs.readFileSync. Returns null if file not found. */
  readFile?: (filePath: string) => string | null
  /** Injectable clock — defaults to Date.now. */
  nowFn?: () => number
  /** Injectable sleep — defaults to real setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>
}

function defaultReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isApproved(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as unknown
    return typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>)['approved'] === true
  } catch {
    return false
  }
}

/**
 * Poll for a signal file at `.workflow-approvals/<taskId>.json`.
 * Resolves when the file appears with `{approved: true}`.
 * Throws `ApprovalTimeoutError` if no signal arrives within `timeoutMs`.
 */
export async function waitForApproval(opts: SignalFileWatcherOptions): Promise<void> {
  const {
    taskId,
    dir = APPROVAL_DIR,
    intervalMs = DEFAULT_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    readFile = defaultReadFile,
    nowFn = Date.now,
    sleep = defaultSleep,
  } = opts

  const safeTaskId = basename(taskId)
  const filePath = path.join(dir, `${safeTaskId}.json`)
  const deadline = nowFn() + timeoutMs

  while (true) {
    const content = readFile(filePath)
    if (content !== null && isApproved(content)) {
      return
    }

    if (nowFn() >= deadline) {
      throw new ApprovalTimeoutError(taskId, timeoutMs)
    }

    await sleep(intervalMs)
  }
}
