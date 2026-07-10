/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Retry Executor — generic retry wrapper with exponential backoff + jitter.
 * Inspired by hermes-agent retry with jittered backoff pattern.
 * Uses error-classifier to determine retryability.
 */

import type Database from 'better-sqlite3'
import { classifyError, calculateBackoff, type ErrorClassification, type ErrorCategory } from './error-classifier.js'
import { recordError } from './error-recorder.js'
import { createLogger } from './logger.js'

const log = createLogger({ layer: 'core', source: 'retry-executor.ts' })

export interface RetryOptions {
  maxAttempts: number
  baseBackoffMs?: number
  maxBackoffMs?: number
  retryableCategories?: Set<ErrorCategory>
  onRetry?: (attempt: number, error: Error, classification: ErrorClassification) => void
  /**
   * When provided, every caught error is persisted via error-recorder's
   * recordError() into error_patterns — so a future adaptive retry policy can
   * escalate when the same pattern recurs. Recording failures are swallowed:
   * a broken/missing table must never mask the real retry/throw flow.
   */
  db?: Database.Database
}

/**
 * Execute a function with automatic retry for retryable errors.
 * Uses error-classifier to determine if an error should trigger a retry.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxAttempts, baseBackoffMs = 200, maxBackoffMs = 30_000, retryableCategories, onRetry, db } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const classification = classifyError(lastError)

      if (db) {
        try {
          recordError(db, lastError)
        } catch (recordErr) {
          log.debug('retry-executor:record-error-failed', { error: String(recordErr) })
        }
      }

      // Determine if retryable
      const isRetryable = retryableCategories
        ? retryableCategories.has(classification.category)
        : classification.retryable

      const isLastAttempt = attempt === maxAttempts - 1

      if (!isRetryable || isLastAttempt) {
        log.debug('retry-executor:exhausted', {
          attempts: attempt + 1,
          category: classification.category,
          retryable: isRetryable,
        })
        throw lastError
      }

      // Calculate backoff and wait
      const delay = calculateBackoff(attempt, baseBackoffMs, maxBackoffMs)

      if (onRetry) {
        onRetry(attempt, lastError, classification)
      }

      log.debug('retry-executor:retry', {
        attempt: attempt + 1,
        maxAttempts,
        category: classification.category,
        delayMs: Math.round(delay),
      })

      await sleep(delay)
    }
  }

  throw lastError ?? new Error('withRetry: no attempts made')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
