/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Self-Healing Listener — creates auto-memories when errors are detected.
 * Subscribes to "error:detected" events on the GraphEventBus.
 * Deduplicates via error hash to prevent flood.
 */

import { createHash } from 'node:crypto'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { GraphEventBus } from '../events/event-bus.js'
import type { GraphEvent } from '../events/event-types.js'
import { createLogger } from '../utils/logger.js'
import { classifyError } from '../utils/error-classifier.js'

const log = createLogger({ layer: 'core', source: 'self-healing-listener.ts' })

export interface SelfHealingOptions {
  memoriesDir: string
  eventBus: GraphEventBus
}

/** Map error-classifier categories to healing category slugs. */
const CATEGORY_MAP: Record<string, string> = {
  rate_limit: 'general-error',
  auth_expired: 'general-error',
  context_overflow: 'general-error',
  timeout: 'general-error',
  network: 'general-error',
  empty_response: 'general-error',
  validation: 'validation-error',
  database: 'database-error',
  build: 'build-error',
  test: 'test-failure',
  module: 'module-error',
  general: 'general-error',
}

/**
 * Categorize an error message into a healing category.
 * Delegates to classifyError() from error-classifier for consistent taxonomy.
 */
export function categorizeError(message: string): string {
  const classification = classifyError(message)
  // Map type-related errors before falling through to classifier
  const lower = message.toLowerCase()
  if (lower.includes('type') && (lower.includes('error') || lower.includes('mismatch'))) {
    return 'type-error'
  }
  return CATEGORY_MAP[classification.category] ?? 'general-error'
}

/** Generate a short hash for deduplication of error patterns. */
export function generateErrorHash(category: string, message: string): string {
  // Normalize: strip dynamic parts like timestamps, line numbers, ids
  const normalized = message
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, '')
    .replace(/\b[a-f0-9]{12,}\b/g, '')
    .replace(/line \d+/gi, 'line N')
    .replace(/:\d+:\d+/g, ':N:N')
    .trim()

  return createHash('sha256').update(`${category}:${normalized}`).digest('hex').slice(0, 12)
}

/** Build the healing memory content. */
export function buildHealingMemory(category: string, errorMessage: string, toolName: string): string {
  const timestamp = new Date().toISOString()
  return [
    `# Self-Healing: ${category}`,
    '',
    '## Error Pattern',
    errorMessage,
    '',
    '## Prevention Rule',
    `When encountering similar ${category} issues, check the tool '${toolName}' inputs and outputs carefully.`,
    'Apply validation at boundaries and verify types match expected schemas before proceeding.',
    '',
    '## Context',
    `- Tool: ${toolName}`,
    `- Category: ${category}`,
    `- Date: ${timestamp}`,
  ].join('\n')
}

/**
 * Register the self-healing listener on the event bus.
 * Returns an unsubscribe function.
 */
export function registerSelfHealingListener(options: SelfHealingOptions): () => void {
  const { memoriesDir, eventBus } = options

  // Ensure memories directory exists
  if (!existsSync(memoriesDir)) {
    mkdirSync(memoriesDir, { recursive: true })
  }

  const handler = (event: GraphEvent): void => {
    if (event.type !== 'error:detected') return

    const { toolName, errorMessage, errorCategory, errorHash } = event.payload as {
      toolName: string
      errorMessage: string
      errorCategory: string
      errorHash: string
    }

    const memoryName = `healing-${errorCategory}-${errorHash}`
    const memoryPath = path.join(memoriesDir, `${memoryName}.md`)

    // Deduplication: skip if memory already exists
    if (existsSync(memoryPath)) {
      log.debug('self-healing:skip-duplicate', { memoryName })
      return
    }

    // Create healing memory
    const content = buildHealingMemory(errorCategory, errorMessage, toolName)
    try {
      writeFileSync(memoryPath, content, 'utf-8')
      log.info('self-healing:memory-created', { memoryName, category: errorCategory })

      // Emit healing event
      eventBus.emitTyped('healing:memory_created', {
        memoryName,
        errorCategory,
        errorHash,
      })
    } catch (err) {
      log.error('self-healing:write-failed', { memoryName, error: String(err) })
    }
  }

  eventBus.on('error:detected', handler)

  return () => {
    eventBus.off('error:detected', handler)
  }
}
