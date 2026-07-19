/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createDatabase, isBunRuntime } from '../store/database-factory.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { checkNativeBinary } from '../store/native-binary-health.js'
import { STORE_DIR, DB_FILE } from '../utils/constants.js'
import { fileExists } from '../utils/fs.js'
import { hasSourceFiles } from '../utils/source-files.js'
import { shouldCheckForUpdates } from '../utils/update-check.js'
import { getIntegrationsStatus } from '../integrations/tool-status.js'
import { createLogger } from '../utils/logger.js'
import { memoryHealth, defaultSampler, type HeapSampler } from '../observability/heap-telemetry.js'
import { createDirectMcpProvider, type DirectMcpProvider } from '../cli-provider/direct-mcp-provider.js'
import { buildLayerPaths, mergeAgentsMd, type AgentsMdLayer } from '../config/agents-md-cascade.js'
import { detectBoundaryDrift } from '../config/boundary-drift.js'
import {
  generateClaudeMdSection,
  detectProjectContext,
  MARKER_START,
  MARKER_END,
} from '../config/ai-memory-generator.js'
import type { CheckResult } from './doctor-types.js'

const log = createLogger({ layer: 'core', source: 'doctor-checks.ts' })

const MIN_NODE_VERSION = 20

/**
 * Check Node.js version >= 20 using the current runtime.
 */
export function checkNodeVersion(): CheckResult {
  return checkNodeVersionWith(process.versions.node)
}

/**
 * Check Node.js version >= 20 with an explicit version string (testable).
 */
export function checkNodeVersionWith(version: string): CheckResult {
  const major = parseInt(version.split('.')[0], 10)
  if (major >= MIN_NODE_VERSION) {
    return {
      name: 'node-version',
      level: 'ok',
      message: `Node.js v${version} (>= ${MIN_NODE_VERSION})`,
    }
  }
  return {
    name: 'node-version',
    level: 'error',
    message: `Node.js v${version} is below minimum v${MIN_NODE_VERSION}`,
    suggestion: `Upgrade Node.js to v${MIN_NODE_VERSION} or later: https://nodejs.org`,
  }
}

/**
 * Check write permissions on the store directory.
 */
export async function checkWritePermissions(basePath: string): Promise<CheckResult> {
  // B18 (node_841f0b641e2a): distinguish "does not exist" from "exists but
  // not writable" so users do not waste time on chmod when the path is wrong.
  if (!existsSync(basePath)) {
    return {
      name: 'write-permissions',
      level: 'error',
      message: `Project directory does not exist: ${basePath}`,
      suggestion: `Create it with 'mkdir -p "${basePath}"' or use --dir to point at the right project`,
    }
  }
  const storeDir = path.join(basePath, STORE_DIR)
  try {
    await access(storeDir, constants.W_OK)
    return {
      name: 'write-permissions',
      level: 'ok',
      message: `Write access to ${STORE_DIR}/`,
    }
  } catch {
    // If store dir doesn't exist, check parent (it does exist — verified above)
    try {
      await access(basePath, constants.W_OK)
      return {
        name: 'write-permissions',
        level: 'ok',
        message: `Write access to project directory (${STORE_DIR}/ will be created)`,
      }
    } catch {
      return {
        name: 'write-permissions',
        level: 'error',
        message: `No write access to ${basePath}`,
        suggestion: `Check directory permissions: chmod u+w "${basePath}"`,
      }
    }
  }
}

/**
 * Check that the SQLite database exists and can be opened.
 */
export async function checkSqliteDatabase(basePath: string): Promise<CheckResult> {
  const dbPath = path.join(basePath, STORE_DIR, DB_FILE)
  if (!existsSync(dbPath)) {
    return {
      name: 'sqlite-database',
      level: 'error',
      message: `Database not found at ${STORE_DIR}/${DB_FILE}`,
      suggestion: "Run 'mcp-graph init' to create the database",
    }
  }
  // B17 (node_aa136f814cfe): better-sqlite3 happily opens a 0-byte file as
  // a fresh empty DB; PRAGMA integrity_check then returns "ok" on it. Catch
  // empty / no-schema files BEFORE they slip through as healthy.
  // B19 (node_22feb42001a1): a directory at the db path bubbles up as
  // "disk I/O error" — name the real problem instead.
  try {
    const st = statSync(dbPath)
    if (st.isDirectory()) {
      return {
        name: 'sqlite-database',
        level: 'error',
        message: `Path ${STORE_DIR}/${DB_FILE} is a directory, not a file`,
        suggestion: `Remove or rename the directory at "${dbPath}" then run 'mcp-graph init'`,
      }
    }
    if (st.size === 0) {
      return {
        name: 'sqlite-database',
        level: 'error',
        message: `Database file at ${STORE_DIR}/${DB_FILE} is empty (0 bytes) — likely truncated or uninitialized`,
        suggestion: "Re-run 'mcp-graph init' or restore from a snapshot",
      }
    }
  } catch (err) {
    log.debug('intentional-swallow', {
      error: String(err),
      reason: 'statSync race with deletion; fall through to open attempt',
    })
  }
  try {
    const db = createDatabase(dbPath, { readonly: true })
    try {
      const rows = db.prepare("SELECT count(*) as n FROM sqlite_master WHERE type IN ('table','view')").get() as {
        n: number
      }
      if (rows.n === 0) {
        return {
          name: 'sqlite-database',
          level: 'error',
          message: `Database at ${STORE_DIR}/${DB_FILE} has no schema — uninitialized or corrupt`,
          suggestion: "Re-run 'mcp-graph init' or restore from a snapshot",
        }
      }
    } finally {
      db.close()
    }
    return {
      name: 'sqlite-database',
      level: 'ok',
      message: `Database exists at ${STORE_DIR}/${DB_FILE}`,
    }
  } catch (err) {
    return {
      name: 'sqlite-database',
      level: 'error',
      message: `Database corrupt or unreadable: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: "Try restoring from a snapshot or re-running 'mcp-graph init'",
    }
  }
}

/**
 * Check database integrity via PRAGMA integrity_check.
 */
export async function checkDbIntegrity(basePath: string): Promise<CheckResult> {
  const dbPath = path.join(basePath, STORE_DIR, DB_FILE)
  if (!existsSync(dbPath)) {
    return {
      name: 'db-integrity',
      level: 'error',
      message: 'Cannot check integrity — database not found',
    }
  }
  // B17: PRAGMA integrity_check on a 0-byte/no-schema DB returns "ok" — that
  // is technically true (no pages to corrupt) but actively misleading. Refuse
  // to run integrity_check unless the file has at least the SQLite header
  // (~100 bytes) and a non-empty schema.
  try {
    if (statSync(dbPath).size < 100) {
      return {
        name: 'db-integrity',
        level: 'error',
        message: 'Database file is too small to be a valid SQLite database — skipping integrity_check',
        suggestion: "Re-run 'mcp-graph init' or restore from a snapshot",
      }
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'fall through to open attempt' })
  }
  try {
    const db = createDatabase(dbPath, { readonly: true })
    let schemaCount = 0
    try {
      schemaCount = (
        db.prepare("SELECT count(*) as n FROM sqlite_master WHERE type IN ('table','view')").get() as { n: number }
      ).n
    } catch (err) {
      log.debug('intentional-swallow', {
        error: String(err),
        reason: 'reading sqlite_master itself failed — DB is unreadable, fall through',
      })
    }
    if (schemaCount === 0) {
      db.close()
      return {
        name: 'db-integrity',
        level: 'error',
        message: 'Database has no schema — cannot run integrity_check',
        suggestion: "Re-run 'mcp-graph init' or restore from a snapshot",
      }
    }
    const resultValue = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    db.close()
    const isOk = resultValue.length === 1 && resultValue[0].integrity_check === 'ok'
    if (isOk) {
      return {
        name: 'db-integrity',
        level: 'ok',
        message: 'Database integrity check passed',
      }
    }
    return {
      name: 'db-integrity',
      level: 'error',
      message: `Database integrity issues: ${resultValue.map((r) => r.integrity_check).join(', ')}`,
      suggestion: 'Restore from a snapshot: mcp-graph snapshot --restore <id>',
    }
  } catch (err) {
    return {
      name: 'db-integrity',
      level: 'error',
      message: `Integrity check failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Check if the graph project is initialized.
 */
export function checkGraphInitialized(store: SqliteStore): CheckResult {
  try {
    const project = store.getProject()
    if (project) {
      return {
        name: 'graph-initialized',
        level: 'ok',
        message: `Project "${project.name}" initialized`,
      }
    }
    return {
      name: 'graph-initialized',
      level: 'warning',
      message: 'No project initialized',
      suggestion: "Run 'mcp-graph init' to initialize a project",
    }
  } catch {
    return {
      name: 'graph-initialized',
      level: 'warning',
      message: 'Could not check project initialization',
      suggestion: "Run 'mcp-graph init' to initialize a project",
    }
  }
}

/**
 * Check if the config file exists and is valid.
 */
/**
 * Report whether the npm-registry update check (ADR-0057) is enabled for
 * this environment, so operators can see why the version banner is/isn't showing.
 */
export function checkUpdateCheckStatus(env: NodeJS.ProcessEnv = process.env): CheckResult {
  const enabled = shouldCheckForUpdates(env)
  return {
    name: 'update-check',
    level: 'ok',
    message: enabled
      ? 'Update check enabled — will phone home to the npm registry (ADR-0057)'
      : 'Update check disabled (MCP_GRAPH_NO_UPDATE_CHECK or CI)',
  }
}

export function checkConfigFile(basePath: string): CheckResult {
  const configPath = path.join(basePath, 'mcp-graph.config.json')
  if (!existsSync(configPath)) {
    return {
      name: 'config-file',
      level: 'ok',
      message: 'No config file — using defaults',
    }
  }
  try {
    const raw = readFileSync(configPath, 'utf-8')
    JSON.parse(raw)
    return {
      name: 'config-file',
      level: 'ok',
      message: 'Config file is valid JSON',
    }
  } catch (err) {
    return {
      name: 'config-file',
      level: 'warning',
      message: `Config file has invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: 'Fix the JSON syntax in mcp-graph.config.json',
    }
  }
}

/**
 * Check the root→cwd AGENTS.md cascade (nearest-wins). Reports how many
 * layers are in play so operators know whether a subdir AGENTS.md is
 * actually being picked up by CLI agents that honour nesting (Codex, OpenCode).
 */
export function checkAgentsMdCascadeWith(
  layerPaths: string[],
  fs: { exists: (p: string) => boolean; read: (p: string) => string } = {
    exists: existsSync,
    read: (p) => readFileSync(p, 'utf-8'),
  },
): CheckResult {
  const layers: AgentsMdLayer[] = layerPaths.filter((p) => fs.exists(p)).map((p) => ({ path: p, content: fs.read(p) }))

  if (layers.length === 0) {
    return {
      name: 'agents-md-cascade',
      level: 'ok',
      message: 'No AGENTS.md found on the root→cwd path — nothing to cascade',
    }
  }
  if (layers.length === 1) {
    return {
      name: 'agents-md-cascade',
      level: 'ok',
      message: `Single AGENTS.md layer (${layers[0]!.path})`,
    }
  }
  const merged = mergeAgentsMd(layers)
  return {
    name: 'agents-md-cascade',
    level: 'ok',
    message: `${layers.length} AGENTS.md layers cascade root→subdir (nearest-wins); merged ${merged.length} chars`,
  }
}

/** Check the AGENTS.md cascade from the project root down to the current working directory. */
export function checkAgentsMdCascade(basePath: string, currentDir: string = process.cwd()): CheckResult {
  return checkAgentsMdCascadeWith(buildLayerPaths(basePath, currentDir))
}

/**
 * Check CLAUDE.md's marker-wrapped section for hand-edit drift against a canonical
 * generated section. Drift means the region will be silently overwritten on the
 * next `agf init`.
 */
export function checkBoundaryDriftWith(
  filePath: string,
  canonical: string,
  fs: { exists: (p: string) => boolean; read: (p: string) => string } = {
    exists: existsSync,
    read: (p) => readFileSync(p, 'utf-8'),
  },
): CheckResult {
  const fileName = path.basename(filePath)

  if (!fs.exists(filePath)) {
    return {
      name: 'boundary-drift',
      level: 'ok',
      message: `${fileName} not found — nothing to check`,
    }
  }

  const findings = detectBoundaryDrift(fs.read(filePath), canonical)
  if (findings.length === 0) {
    return {
      name: 'boundary-drift',
      level: 'ok',
      message: `${fileName} matches the canonical generated section`,
    }
  }

  return {
    name: 'boundary-drift',
    level: 'warning',
    message: `${fileName} has hand-edited drift inside the agent-graph-flow markers`,
    suggestion: `Move custom content outside the markers in ${fileName}, or run 'agf init --force' to accept the canonical section`,
  }
}

/** Extract just the body between the markers from a generated (fully wrapped) section. */
function extractCanonicalBody(wrapped: string): string {
  const startIdx = wrapped.indexOf(MARKER_START)
  const endIdx = wrapped.indexOf(MARKER_END)
  if (startIdx === -1 || endIdx === -1) return wrapped.trim()
  return wrapped.slice(startIdx + MARKER_START.length, endIdx).trim()
}

/** Check CLAUDE.md for boundary drift against the canonical section for this project. */
export function checkBoundaryDrift(basePath: string): CheckResult {
  const filePath = path.join(basePath, 'CLAUDE.md')
  const projectName = path.basename(basePath)
  const canonical = extractCanonicalBody(generateClaudeMdSection(projectName, 'lean', detectProjectContext(basePath)))
  return checkBoundaryDriftWith(filePath, canonical)
}

/**
 * Check whether `basePath` contains any recognizable source file. Catches the
 * common footgun of running `agf init`/`agf doctor` in the wrong directory.
 */
export async function checkHasSourceFiles(basePath: string): Promise<CheckResult> {
  const found = await hasSourceFiles(basePath)
  if (found) {
    return { name: 'has-source-files', level: 'ok', message: 'Directory contains recognizable source files' }
  }
  return {
    name: 'has-source-files',
    level: 'warning',
    message: 'No recognizable source files (.go/.ts/.tsx/.js/.jsx) found in this directory',
    suggestion: 'Confirm --dir points at your project root, not an empty or unrelated directory',
  }
}

/**
 * Check if the dashboard build artifacts exist.
 */
export async function checkDashboardBuild(basePath: string): Promise<CheckResult> {
  const dashboardIndex = path.join(basePath, 'dist', 'web', 'dashboard', 'index.html')
  const exists = await fileExists(dashboardIndex)
  if (exists) {
    return {
      name: 'dashboard-build',
      level: 'ok',
      message: 'Dashboard build found',
    }
  }
  return {
    name: 'dashboard-build',
    level: 'warning',
    message: 'Dashboard build not found',
    suggestion: "Run 'npm run build' to build the dashboard",
  }
}

/**
 * Check integration tools (Code Graph, Memories, Playwright).
 */
export async function checkIntegrations(basePath: string): Promise<CheckResult[]> {
  try {
    const status = await getIntegrationsStatus(basePath)
    const results: CheckResult[] = []

    // Code Graph
    results.push({
      name: 'integration-code-graph',
      level: status.codeGraph.running ? 'ok' : 'warning',
      message: status.codeGraph.running
        ? `Code Graph indexed (${status.codeGraph.symbolCount} symbols)`
        : 'Code Graph not indexed',
      ...(!status.codeGraph.running && {
        suggestion: 'Run code graph reindex via dashboard or API',
      }),
    })

    // Memories
    results.push({
      name: 'integration-memories',
      level: status.memories.available ? 'ok' : 'warning',
      message: status.memories.available
        ? `Memories available (${status.memories.count} memories in ${status.memories.directory})`
        : 'No memories found',
      ...(!status.memories.available && {
        suggestion: 'Create memories in workflow-graph/memories/ or run `agf memory write`',
      }),
    })

    // Playwright
    results.push({
      name: 'integration-playwright',
      level: status.playwright.installed ? 'ok' : 'warning',
      message: status.playwright.installed ? 'Playwright available' : 'Playwright not available',
      ...(!status.playwright.installed && {
        suggestion: 'Install Playwright: npx playwright install',
      }),
    })

    return results
  } catch (err) {
    log.debug('doctor:integrations:fail', {
      error: err instanceof Error ? err.message : String(err),
    })
    return [
      {
        name: 'integration-code-graph',
        level: 'warning',
        message: 'Could not check Code Graph status',
      },
      {
        name: 'integration-memories',
        level: 'warning',
        message: 'Could not check Memories status',
      },
      {
        name: 'integration-playwright',
        level: 'warning',
        message: 'Could not check Playwright status',
      },
    ]
  }
}

/**
 * Check ONNX neural embedding availability (testable — accepts injected checker).
 */
export async function checkOnnxStatusWith(isAvailable: () => Promise<boolean>): Promise<CheckResult> {
  try {
    const available = await isAvailable()
    if (available) {
      return {
        name: 'onnx_status',
        level: 'ok',
        message: 'onnxruntime-node installed — RAG neural embeddings active',
      }
    }
    return {
      name: 'onnx_status',
      level: 'warning',
      message: 'onnxruntime-node unavailable — RAG using hash embeddings (degraded mode)',
      suggestion: 'Opt-in to neural embeddings: run `agf install-neural`',
    }
  } catch {
    return {
      name: 'onnx_status',
      level: 'warning',
      message: 'Could not determine ONNX status',
      suggestion: 'Run `agf install-neural` to enable neural embeddings',
    }
  }
}

/**
 * Check ONNX status using the real isOnnxAvailable (production path).
 */
export async function checkOnnxStatus(): Promise<CheckResult> {
  const { isOnnxAvailable } = await import('../rag/onnx-embeddings.js')
  return checkOnnxStatusWith(isOnnxAvailable)
}

// ── Dormant module registry ───────────────────────────────────────────────────

interface DormantModuleDef {
  module: string
  description: string
}

const DORMANT_MODULES: DormantModuleDef[] = [
  { module: 'core/event-store', description: 'Observability event schema + writer/query — no runtime importers' },
  { module: 'core/session', description: 'Session state I/O (V2, auto-migration) — not wired to TUI/CLI' },
  { module: 'core/guardian', description: 'Tool-call security reviewer — not linked to executor/sandbox' },
  { module: 'core/patch', description: 'Unified diff applicator — implementer uses search/replace' },
  { module: 'core/sandbox', description: 'Build executor + stack detection — build delegated externally' },
  {
    module: 'core/llm/gateway',
    description: 'Rich LLM gateway (failover, tool-calls, streaming) — parallel to model-hub',
  },
  {
    module: 'core/economy/economy-orchestrator',
    description: 'Economy middleware for HTTP gateway — 0 runtime importers',
  },
  { module: 'core/economy/caveman-input', description: 'Lossy NL filter — not adopted in active implement path' },
  { module: 'core/economy/economy-pipeline', description: 'Lever ordering orchestrator — 0 runtime importers' },
]

export interface DormantModuleEntry {
  module: string
  importCount: number
  deprecationStatus: 'deletion_candidate'
  description: string
}

export type DormantCheckResult = CheckResult & { data: DormantModuleEntry[] }

export interface SourceFileRecord {
  path: string
  content: string
}

function isDormantTestFile(filePath: string): boolean {
  return filePath.includes('/tests/') || filePath.includes('.test.') || filePath.includes('.spec.')
}

function moduleStem(modulePath: string): string {
  const parts = modulePath.split('/')
  return parts[parts.length - 1]
}

/**
 * Check for dormant modules — surfaces modules that have no runtime importers
 * (advisory: ok level) or have been newly imported in non-test code (warning level).
 * Each entry carries `deprecationStatus: 'deletion_candidate'`.
 */
export function checkDormantModules(sourceFiles: SourceFileRecord[]): DormantCheckResult {
  const runtimeFiles = sourceFiles.filter((f) => !isDormantTestFile(f.path))

  const data: DormantModuleEntry[] = DORMANT_MODULES.map(({ module, description }) => {
    const stem = moduleStem(module)
    const importCount = runtimeFiles.filter((f) => f.content.includes(stem)).length
    return { module, importCount, deprecationStatus: 'deletion_candidate', description }
  })

  const runtimeImports = data.filter((e) => e.importCount > 0)

  if (runtimeImports.length > 0) {
    const names = runtimeImports.map((e) => e.module).join(', ')
    return {
      name: 'dormant-modules',
      level: 'warning',
      message: `Dormant module(s) imported in runtime code: ${names}. These are marked deletion_candidate — remove the import or promote the module if it is now intentionally active.`,
      suggestion: 'Run `agf node add --type risk` to track promotion, or remove the import.',
      data,
    }
  }

  return {
    name: 'dormant-modules',
    level: 'ok',
    message: `${data.length} dormant module(s) tracked — all have importCount=0 in runtime paths (advisory: all marked deletion_candidate, no action needed today).`,
    data,
  }
}

/**
 * Check that better-sqlite3's native `.node` binary has not been silently
 * swapped for the wrong platform (a concurrent cross-compile pack run can do
 * this — see native-binary-health.ts). Testable variant (injected resolver).
 */
export function checkNativeBinaryHealthWith(opts: { isBun: boolean; resolveBinaryPath: () => string }): CheckResult {
  if (opts.isBun) {
    return {
      name: 'native-binary-health',
      level: 'ok',
      message: 'Bun runtime — uses bun:sqlite, no native .node binary to check',
    }
  }
  let binaryPath: string
  try {
    binaryPath = opts.resolveBinaryPath()
  } catch (err) {
    return {
      name: 'native-binary-health',
      level: 'warning',
      message: `Could not locate better-sqlite3's native binary: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  const health = checkNativeBinary(binaryPath)
  if (health.ok) {
    return {
      name: 'native-binary-health',
      level: 'ok',
      message: `Native binary healthy: ${binaryPath}`,
    }
  }
  return {
    name: 'native-binary-health',
    level: 'error',
    message: `Native binary check failed: ${health.reason}`,
    suggestion: 'Run: npm rebuild better-sqlite3',
  }
}

/**
 * Check native binary health using the real runtime (production path).
 */
export function checkNativeBinaryHealth(): CheckResult {
  return checkNativeBinaryHealthWith({
    isBun: isBunRuntime,
    resolveBinaryPath: () => {
      const req = createRequire(import.meta.url)
      return req.resolve('better-sqlite3/build/Release/better_sqlite3.node')
    },
  })
}

/**
 * Check current process memory health (heap/RSS/external) — a one-shot
 * snapshot, not the interval-based HeapTelemetry (no long-running daemon
 * context exists here; each `agf` command is a fresh process).
 */
export function checkMemoryHealth(sampler: HeapSampler = defaultSampler): CheckResult {
  const health = memoryHealth(sampler)
  const healthy = health.recommendations.length === 1 && health.recommendations[0] === 'memory healthy'
  return {
    name: 'memory-health',
    level: healthy ? 'ok' : 'warning',
    message: `heap=${health.heapMB.toFixed(0)}MB rss=${health.rssMB.toFixed(0)}MB external=${health.externalMB.toFixed(0)}MB — ${healthy ? 'memory healthy' : 'attention needed'}`,
    ...(healthy ? {} : { suggestion: health.recommendations.join('; ') }),
  }
}

/**
 * Check that the in-process MCP bridge (DirectMcpProvider) can connect.
 * Uses `simulate: true` — a real bootstrap would open the SQLite store and
 * start a server, too heavy for a one-shot doctor check. Testable variant
 * (injected factory).
 */
export async function checkMcpBridgeHealthWith(createProvider: () => DirectMcpProvider): Promise<CheckResult> {
  const provider = createProvider()
  const status = await provider.start({ simulate: true })
  if (status.connected) {
    return {
      name: 'mcp-bridge',
      level: 'ok',
      message: `${provider.label} bridge ready (v${status.version})`,
    }
  }
  return {
    name: 'mcp-bridge',
    level: 'warning',
    message: `${provider.label} bridge failed to connect in simulate mode`,
    suggestion: 'Check src/core/cli-provider/direct-mcp-provider.ts',
  }
}

/**
 * Check MCP bridge health using the real DirectMcpProvider (production path).
 */
export function checkMcpBridgeHealth(): Promise<CheckResult> {
  return checkMcpBridgeHealthWith(createDirectMcpProvider)
}
