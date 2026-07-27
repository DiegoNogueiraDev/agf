import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/browser-workbench.ts' })

const BROWSER_WORKBENCH_DIR = '.agents/workbench/browser'
const FORBIDDEN_APIS = ['fs', 'child_process', 'process.exit', 'require(', 'import ', 'eval(']

export interface BrowserHelperEntry {
  name: string
  source: string
  path: string
}

function ensureDir(): string {
  const dir = join(cwd(), BROWSER_WORKBENCH_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Lists all registered Python browser helper scripts from the helpers directory. */
export function listBrowserHelpers(): BrowserHelperEntry[] {
  log.debug('listing browser helpers')
  const dir = ensureDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.py'))
  return files.map((f) => {
    const source = readFileSync(join(dir, f), 'utf-8')
    return { name: f.replace(/\.py$/, ''), source, path: join(dir, f) }
  })
}

/** Returns the content and path of a named browser helper script, or null if not found. */
export function showBrowserHelper(name: string): BrowserHelperEntry | null {
  const dir = ensureDir()
  const fp = join(dir, `${name}.py`)
  if (!existsSync(fp)) return null
  return { name, source: readFileSync(fp, 'utf-8'), path: fp }
}

export interface AddHelperResult {
  ok: boolean
  error?: string
}

const FORBIDDEN_CHECK = new RegExp(FORBIDDEN_APIS.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))

/** Validates and persists a new Python browser helper script; returns ok=false with error on invalid name, oversized source, or forbidden APIs. */
export function addBrowserHelper(name: string, source: string): AddHelperResult {
  if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
    return { ok: false, error: `Invalid helper name "${name}". Use snake_case.` }
  }
  if (source.length > 4096) {
    return { ok: false, error: 'Helper source too large (max 4096 bytes).' }
  }
  if (FORBIDDEN_CHECK.test(source)) {
    return {
      ok: false,
      error: `Helper blocked: contains forbidden API (fs, child_process, process.exit, require, import, eval).`,
    }
  }
  const dir = ensureDir()
  writeFileSync(join(dir, `${name}.py`), source, 'utf-8')
  return { ok: true }
}
