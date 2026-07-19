/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 Browser Use (browser-harness)
 * Copyright © 2026 Diego Lima Nogueira de Paula (port and changes)
 *
 * Ported from browser-harness (https://github.com/browser-use/browser-harness), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * task-workbench-cmd — Agent workbench for reusable helper functions.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { createLogger } from '../core/utils/logger.js'

const WORKBENCH_DIR = '.agents/workbench'
const HELPERS_FILE = 'helpers.ts'

export interface WorkbenchEntry {
  name: string
  path: string
  content: string
}

const log = createLogger({ layer: 'cli', source: 'tui/workbench.ts' })

function ensureDir(): string {
  log.debug('ensuring workbench dir')
  const dir = join(cwd(), WORKBENCH_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Lists all named helper entries from the workbench helpers file. */
export function listHelpers(): WorkbenchEntry[] {
  const dir = ensureDir()
  if (!existsSync(join(dir, HELPERS_FILE))) return []
  const content = readFileSync(join(dir, HELPERS_FILE), 'utf-8')
  return parseEntries(content)
}

function parseEntries(content: string): WorkbenchEntry[] {
  const entries: WorkbenchEntry[] = []
  const re = /\/\/\s*@workbench\s+name:\s*(\S+)\s*\n(?:export\s+)?(?:async\s+)?function\s+\w+/g
  let match
  while ((match = re.exec(content)) !== null) {
    entries.push({ name: match[1], path: HELPERS_FILE, content: match[0] })
  }
  return entries
}

/** Reads the full workbench helpers file content, or empty string if absent. */
export function loadWorkbench(): string {
  const dir = ensureDir()
  const fp = join(dir, HELPERS_FILE)
  if (!existsSync(fp)) return ''
  return readFileSync(fp, 'utf-8')
}

/** Overwrites the workbench helpers file with the given content. */
export function saveWorkbench(content: string): void {
  const dir = ensureDir()
  writeFileSync(join(dir, HELPERS_FILE), content, 'utf-8')
}

/** Appends a new named helper entry to the workbench helpers file. */
export function addWorkbenchEntry(name: string, fnBody: string): void {
  const dir = ensureDir()
  const fp = join(dir, HELPERS_FILE)
  const existing = existsSync(fp) ? readFileSync(fp, 'utf-8') : ''
  const entry = `// @workbench name: ${name}\nexport function ${name}() {\n  ${fnBody}\n}\n\n`
  writeFileSync(fp, existing + entry, 'utf-8')
}
