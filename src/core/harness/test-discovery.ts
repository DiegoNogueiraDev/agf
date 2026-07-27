/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Test Discovery — Auto-discover test files by node title keywords
 *
 * When a node has no testFiles, extracts keywords from the title
 * and searches src/tests/ for matching *.test.ts files.
 * Used as fallback in the finish_task pipeline.
 */

import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'test-discovery.ts' })

const MAX_RESULTS = 20

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'by',
  'is',
  'it',
  'and',
  'or',
  'not',
  'with',
  'from',
  'as',
  'be',
  'add',
  'fix',
  'implement',
  'update',
  'create',
  'remove',
  'delete',
  'refactor',
  'move',
  'rename',
  'change',
  'make',
  'set',
  'get',
  'use',
  'new',
  'old',
  'this',
  'that',
  'should',
  'will',
  'can',
])

/** discoverTestFiles —  */
export function discoverTestFiles(nodeTitle: string, basePath: string): string[] {
  const testsDir = join(basePath, 'src', 'tests')
  if (!existsSync(testsDir)) {
    return []
  }
  const keywords = extractKeywords(nodeTitle)
  if (keywords.length === 0) {
    return []
  }
  try {
    const entries = readdirSync(testsDir)
    const testFiles: string[] = []
    for (const entry of entries) {
      if (typeof entry !== 'string') continue
      if (!entry.endsWith('.test.ts')) continue
      const nameLower = entry.toLowerCase()
      const matches = keywords.some((kw) => nameLower.includes(kw))
      if (matches) {
        testFiles.push(join('src', 'tests', entry))
      }
      if (testFiles.length >= MAX_RESULTS) break
    }
    if (testFiles.length > 0) {
      log.debug('test-discovery:found', {
        title: nodeTitle,
        keywords,
        found: testFiles.length,
      })
    }
    return testFiles
  } catch (err) {
    log.warn('test-discovery:error', { error: String(err) })
    return []
  }
}

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[\s\-_/.,;:!?()]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}
