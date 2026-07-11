/*!
 * Named reusable loop definitions — persist/load/list by name.
 *
 * WHY: `agf loop` is stateless; users have to remember flags every run.
 * Named loops store the definition (interval + rubric path) so `agf loop run
 * <name>` re-executes with the original parameters — no re-typing required.
 *
 * Storage: workflow-graph/memories/named-loops.json (project-local JSON file).
 * This keeps it zero-dependency and consistent with other memory stores.
 *
 * Composes with: loop-cmd.ts (CLI surface), loop-list.ts (runtime registry).
 * Contract: all functions are synchronous and pure-I/O; no SQLite dependency.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpGraphError } from '../utils/errors.js'

export interface NamedLoopDef {
  name: string
  every?: string
  goal?: string
  createdAt: string
}

const STORE_REL = join('workflow-graph', 'memories', 'named-loops.json')

function storePath(projectDir: string): string {
  return join(projectDir, STORE_REL)
}

function readStore(projectDir: string): NamedLoopDef[] {
  const p = storePath(projectDir)
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as NamedLoopDef[]
  } catch {
    return []
  }
}

function writeStore(projectDir: string, entries: NamedLoopDef[]): void {
  const p = storePath(projectDir)
  mkdirSync(join(projectDir, 'workflow-graph', 'memories'), { recursive: true })
  writeFileSync(p, JSON.stringify(entries, null, 2) + '\n', 'utf-8')
}

/**
 * Persist a named loop definition.
 * @throws {McpGraphError} when name already exists and force is not set.
 */
export function saveNamedLoop(
  projectDir: string,
  name: string,
  def: Omit<NamedLoopDef, 'name' | 'createdAt'>,
  opts: { force?: boolean } = {},
): NamedLoopDef {
  const entries = readStore(projectDir)
  const existingIdx = entries.findIndex((e) => e.name === name)
  if (existingIdx !== -1 && !opts.force) {
    throw new McpGraphError(`Named loop "${name}" already exists. Use --force to overwrite.`)
  }
  const entry: NamedLoopDef = { ...def, name, createdAt: new Date().toISOString() }
  const updated = existingIdx !== -1 ? entries.map((e, i) => (i === existingIdx ? entry : e)) : [...entries, entry]
  writeStore(projectDir, updated)
  return entry
}

/** Return all saved named loop definitions. */
export function listNamedLoops(projectDir: string): NamedLoopDef[] {
  return readStore(projectDir)
}

/** Return a single named loop definition, or null if not found. */
export function loadNamedLoop(projectDir: string, name: string): NamedLoopDef | null {
  return readStore(projectDir).find((e) => e.name === name) ?? null
}
