/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Memory Migrator — copies .serena/memories/ → workflow-graph/memories/.
 * Skips files that already exist in target. Used for seamless transition
 * from Serena MCP to native memory system.
 */

import path from 'node:path'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createLogger } from '../utils/logger.js'
import { STORE_DIR } from '../utils/constants.js'

const log = createLogger({ layer: 'core', source: 'memory-migrator.ts' })

export interface MigrationResult {
  migrated: number
  skipped: number
}

const SERENA_MEMORIES_DIR = '.serena/memories'
const TARGET_MEMORIES_DIR = 'memories'

/**
 * Recursively collect all .md file paths relative to root.
 */
async function collectFiles(dir: string, root: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await collectFiles(fullPath, root)
      results.push(...nested)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.relative(root, fullPath))
    }
  }

  return results
}

/**
 * Migrate Serena memories from .serena/memories/ to workflow-graph/memories/.
 * Files that already exist in the target are skipped (not overwritten).
 */
export async function migrateSerenaMemories(basePath: string): Promise<MigrationResult> {
  const sourceDir = path.join(basePath, SERENA_MEMORIES_DIR)
  const targetDir = path.join(basePath, STORE_DIR, TARGET_MEMORIES_DIR)

  if (!existsSync(sourceDir)) {
    return { migrated: 0, skipped: 0 }
  }

  let migrated = 0
  let skipped = 0

  const files = await collectFiles(sourceDir, sourceDir)

  for (const relativePath of files) {
    const sourcePath = path.join(sourceDir, relativePath)
    const targetPath = path.join(targetDir, relativePath)

    if (existsSync(targetPath)) {
      skipped++
      continue
    }

    const targetFileDir = path.dirname(targetPath)
    if (!existsSync(targetFileDir)) {
      await mkdir(targetFileDir, { recursive: true })
    }

    const content = await readFile(sourcePath, 'utf-8')
    await writeFile(targetPath, content, 'utf-8')
    migrated++
  }

  if (migrated > 0) {
    log.info('Serena memories migrated', { migrated, skipped, from: sourceDir, to: targetDir })
  }

  return { migrated, skipped }
}
