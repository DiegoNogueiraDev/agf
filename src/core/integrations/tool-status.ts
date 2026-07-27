import { existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { createDatabase } from '../store/database-factory.js'

export interface ToolInfo {
  name: string
  running: boolean
  version?: string
}

export interface IntegrationsStatus {
  codeGraph: { running: boolean; symbolCount: number }
  memories: { available: boolean; count: number; directory: string }
  playwright: { installed: boolean; version?: string }
}

export async function getIntegrationsStatus(basePath: string): Promise<IntegrationsStatus> {
  const memoriesDir = path.join(basePath, 'workflow-graph', 'memories')

  return {
    codeGraph: await detectCodeGraph(basePath),
    memories: detectMemories(memoriesDir),
    playwright: detectPlaywright(),
  }
}

async function detectCodeGraph(basePath: string): Promise<{ running: boolean; symbolCount: number }> {
  try {
    const dbPath = path.join(basePath, 'workflow-graph', 'graph.db')
    if (!existsSync(dbPath)) {
      return { running: false, symbolCount: 0 }
    }
    const db = createDatabase(dbPath, { readonly: true })
    try {
      const row = db.prepare('SELECT count(*) as n FROM code_symbols').get() as { n: number }
      return { running: true, symbolCount: row.n }
    } finally {
      db.close()
    }
  } catch {
    return { running: false, symbolCount: 0 }
  }
}

function detectMemories(dir: string): { available: boolean; count: number; directory: string } {
  try {
    if (!existsSync(dir)) {
      return { available: false, count: 0, directory: dir }
    }
    const entries = readdirSync(dir, { withFileTypes: true })
    const files = entries.filter((e) => e.isFile())
    return { available: true, count: files.length, directory: dir }
  } catch {
    return { available: false, count: 0, directory: dir }
  }
}

function detectPlaywright(): { installed: boolean; version?: string } {
  try {
    const output = execSync('npx playwright --version', { stdio: 'pipe', timeout: 10000 }).toString().trim()
    return { installed: true, version: output }
  } catch {
    return { installed: false }
  }
}
