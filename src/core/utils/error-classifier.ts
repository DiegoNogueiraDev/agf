/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Error Classification — expanded taxonomy with 12 categories.
 * Inspired by hermes-agent classify_api_error module.
 * Replaces inline categorizeError() in self-healing-listener.
 */

import { ErrorKind } from '../errors/error-envelope.js'

export interface ErrorClassification {
  category: ErrorCategory
  retryable: boolean
  suggestedAction: string
  backoffMs: number | undefined
  /** Envelope field: machine-readable kind (mapeado de ErrorCategory) */
  kind?: string
  /** Envelope field: operacao que falhou */
  operation?: string
  /** Envelope field: recurso alvo */
  target?: string
}

/** Mapeia ErrorCategory para ErrorKind compatível com ErrorEnvelope. */
export function categoryToKind(category: ErrorCategory): string {
  const map: Partial<Record<ErrorCategory, string>> = {
    rate_limit: ErrorKind.RateLimit,
    auth_expired: ErrorKind.Auth,
    context_overflow: ErrorKind.Validation,
    timeout: ErrorKind.Network,
    network: ErrorKind.Network,
    empty_response: ErrorKind.Unknown,
    validation: ErrorKind.Validation,
    database: ErrorKind.Database,
    build: ErrorKind.Unknown,
    test: ErrorKind.Unknown,
    module: ErrorKind.Parse,
    general: ErrorKind.Unknown,
  }
  return map[category] ?? ErrorKind.Unknown
}

export type ErrorCategory =
  | 'rate_limit'
  | 'auth_expired'
  | 'context_overflow'
  | 'timeout'
  | 'network'
  | 'empty_response'
  | 'validation'
  | 'database'
  | 'build'
  | 'test'
  | 'module'
  | 'general'

interface CategoryRule {
  patterns: RegExp[]
  retryable: boolean
  suggestedAction: string
  baseBackoffMs: number
}

export const ERROR_CATEGORIES = new Map<ErrorCategory, CategoryRule>([
  [
    'rate_limit',
    {
      patterns: [/429/i, /too many requests/i, /rate.?limit/i, /throttl/i],
      retryable: true,
      suggestedAction: 'Wait and retry with exponential backoff',
      baseBackoffMs: 2000,
    },
  ],
  [
    'auth_expired',
    {
      patterns: [/401/i, /unauthorized/i, /forbidden/i, /403/i, /auth.*expir/i, /invalid.*key/i, /invalid.*token/i],
      retryable: false,
      suggestedAction: 'Check API credentials and authentication',
      baseBackoffMs: 0,
    },
  ],
  [
    'context_overflow',
    {
      patterns: [/context.?length/i, /token.?limit/i, /too.?long/i, /max.*tokens/i],
      retryable: false,
      suggestedAction: 'Reduce context size or use compression',
      baseBackoffMs: 0,
    },
  ],
  [
    'timeout',
    {
      patterns: [/timeout/i, /timed?\s*out/i, /ETIMEDOUT/i, /deadline/i],
      retryable: true,
      suggestedAction: 'Retry with longer timeout or smaller payload',
      baseBackoffMs: 1000,
    },
  ],
  [
    'network',
    {
      patterns: [/ECONNRESET/i, /ECONNREFUSED/i, /ENOTFOUND/i, /network/i, /socket hang up/i, /fetch failed/i],
      retryable: true,
      suggestedAction: 'Check network connectivity and retry',
      baseBackoffMs: 500,
    },
  ],
  [
    'empty_response',
    {
      patterns: [/empty.?response/i, /no.?content/i, /null.?body/i],
      retryable: true,
      suggestedAction: 'Retry — model may have returned empty',
      baseBackoffMs: 1000,
    },
  ],
  [
    'validation',
    {
      patterns: [/validation.?fail/i, /invalid.?input/i, /schema.?error/i, /zod/i],
      retryable: false,
      suggestedAction: 'Fix input data to match expected schema',
      baseBackoffMs: 0,
    },
  ],
  [
    'database',
    {
      patterns: [
        /SQLITE_BUSY/i,
        /SQLITE_LOCKED/i,
        /SQLITE_CORRUPT/i,
        /sqlite/i,
        /database.?lock/i,
        /database.?error/i,
        /constraint.?violation/i,
        /migration.*fail/i,
      ],
      retryable: true,
      suggestedAction: 'Retry — database may be temporarily locked',
      baseBackoffMs: 200,
    },
  ],
  [
    'build',
    {
      patterns: [
        /TS\d{4}:/i,
        /compilation.?fail/i,
        /compile.*error/i,
        /build.?fail/i,
        /type.?error/i,
        /syntax.?error/i,
      ],
      retryable: false,
      suggestedAction: 'Fix TypeScript/build errors before retrying',
      baseBackoffMs: 0,
    },
  ],
  [
    'test',
    {
      patterns: [/test.?fail/i, /expected.*to\s+(equal|be|match)/i, /assert/i, /vitest/i],
      retryable: false,
      suggestedAction: 'Fix failing test assertions',
      baseBackoffMs: 0,
    },
  ],
  [
    'module',
    {
      patterns: [
        /cannot find module/i,
        /cannot import/i,
        /module not found/i,
        /ERR_MODULE_NOT_FOUND/i,
        /import.*failed/i,
      ],
      retryable: false,
      suggestedAction: 'Check module path and ensure dependency is installed',
      baseBackoffMs: 0,
    },
  ],
  [
    'general',
    {
      patterns: [],
      retryable: false,
      suggestedAction: 'Investigate error details',
      baseBackoffMs: 0,
    },
  ],
])

/**
 * Classify an error into one of 12 categories with retryability and action hints.
 */
export function classifyError(error: Error | unknown): ErrorClassification {
  const message = error instanceof Error ? error.message : String(error ?? '')

  for (const [category, rule] of ERROR_CATEGORIES) {
    if (category === 'general') continue
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) {
        return {
          category,
          retryable: rule.retryable,
          suggestedAction: rule.suggestedAction,
          backoffMs: rule.baseBackoffMs,
          kind: categoryToKind(category),
          operation: 'classify',
          target: message.slice(0, 120),
        }
      }
    }
  }

  const generalRule = ERROR_CATEGORIES.get('general')
  return {
    category: 'general',
    retryable: generalRule?.retryable ?? false,
    suggestedAction: generalRule?.suggestedAction ?? 'inspect_error',
    backoffMs: generalRule?.baseBackoffMs,
    kind: ErrorKind.Unknown,
    operation: 'classify',
    target: message.slice(0, 120),
  }
}

/**
 * Calculate backoff delay with exponential growth and jitter.
 * Formula: min(baseMs * 2^attempt + random(0, baseMs * 2^attempt), maxMs)
 */
export function calculateBackoff(attempt: number, baseMs: number = 200, maxMs: number = 30_000): number {
  const exponential = baseMs * Math.pow(2, attempt)
  const jitter = Math.random() * exponential
  return Math.min(exponential + jitter, maxMs)
}
