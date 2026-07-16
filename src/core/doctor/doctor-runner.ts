/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { SqliteStore } from '../store/sqlite-store.js'
import { STORE_DIR, DB_FILE } from '../utils/constants.js'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'
import { COMMAND_REGISTRY } from '../config/command-registry.js'
import type { CheckResult, DoctorReport } from './doctor-types.js'
import {
  checkNodeVersion,
  checkWritePermissions,
  checkSqliteDatabase,
  checkDbIntegrity,
  checkGraphInitialized,
  checkConfigFile,
  checkDashboardBuild,
  checkIntegrations,
  checkOnnxStatus,
  checkNativeBinaryHealth,
  checkMemoryHealth,
  checkMcpBridgeHealth,
  checkAgentsMdCascade,
  checkBoundaryDrift,
  checkHasSourceFiles,
  checkUpdateCheckStatus,
} from './doctor-checks.js'
import { checkSentruxHealthSafe } from './doctor-checks-sentrux.js'
import { checkSentruxMcpHealth } from './sentrux-mcp-health-check.js'
import { checkSerenaHealthSafe } from './doctor-checks-serena.js'

const log = createLogger({ layer: 'core', source: 'doctor-runner.ts' })

function checkCommandRegistryDrift(): CheckResult {
  const registeredCount = COMMAND_REGISTRY.length
  if (registeredCount === 0) {
    return {
      name: 'command-registry',
      level: 'error',
      message: 'Command registry is empty — critical misconfiguration.',
      suggestion: 'Check src/core/config/command-registry.ts',
    }
  }
  return {
    name: 'command-registry',
    level: 'ok',
    message: `Command registry has ${registeredCount} commands registered — context files are dynamically generated.`,
  }
}

function buildSummary(checks: CheckResult[]): DoctorReport['summary'] {
  let ok = 0
  let warning = 0
  let error = 0
  for (const cVar of checks) {
    if (cVar.level === 'ok') ok++
    else if (cVar.level === 'warning') warning++
    else error++
  }
  return { ok, warning, error }
}

/**
 * Run all doctor checks and return a structured report.
 */
export async function runDoctor(basePath: string): Promise<DoctorReport> {
  if (!basePath) {
    throw new McpGraphError('Doctor requires a valid base path')
  }
  log.info('Running doctor checks', { basePath })

  const checks: CheckResult[] = []

  // 1. Sync checks
  checks.push(checkNodeVersion())
  checks.push(checkConfigFile(basePath))
  checks.push(checkNativeBinaryHealth())
  checks.push(checkMemoryHealth())
  checks.push(checkAgentsMdCascade(basePath))
  checks.push(checkBoundaryDrift(basePath))
  checks.push(checkUpdateCheckStatus())

  // 2. Async checks (parallel where possible)
  const [
    writeResult,
    sqliteResult,
    dbIntegrityResult,
    dashboardResult,
    integrationResults,
    onnxResult,
    mcpBridgeResult,
    hasSourceFilesResult,
    sentruxHealthResult,
    sentruxMcpHealthResult,
    serenaHealthResult,
  ] = await Promise.all([
    checkWritePermissions(basePath),
    checkSqliteDatabase(basePath),
    checkDbIntegrity(basePath),
    checkDashboardBuild(basePath),
    checkIntegrations(basePath),
    checkOnnxStatus(),
    checkMcpBridgeHealth(),
    checkHasSourceFiles(basePath),
    checkSentruxHealthSafe(),
    checkSentruxMcpHealth(),
    checkSerenaHealthSafe(),
  ])

  checks.push(writeResult)
  checks.push(sqliteResult)
  checks.push(dbIntegrityResult)
  checks.push(dashboardResult)
  checks.push(...integrationResults)
  checks.push(onnxResult)
  checks.push(mcpBridgeResult)
  checks.push(hasSourceFilesResult)
  checks.push(sentruxHealthResult)
  checks.push(sentruxMcpHealthResult)
  checks.push(serenaHealthResult)

  // 3. Store-dependent checks (only if DB exists)
  const dbPath = path.join(basePath, STORE_DIR, DB_FILE)
  if (existsSync(dbPath)) {
    try {
      const store = SqliteStore.open(basePath)
      try {
        checks.push(checkGraphInitialized(store))
      } finally {
        store.close()
      }
    } catch (err) {
      checks.push({
        name: 'graph-initialized',
        level: 'warning',
        message: `Could not open store: ${err instanceof Error ? err.message : String(err)}`,
        suggestion: "Run 'agf init' to initialize the project",
      })
    }
  }

  // 4. Command registry drift detection
  checks.push(checkCommandRegistryDrift())

  for (const result of checks) {
    log.event(
      { action: 'health.check', category: 'health', outcome: result.level === 'ok' ? 'success' : 'failure' },
      `health.check.${result.name}`,
      { check: result.name },
    )
  }

  const summary = buildSummary(checks)

  return {
    checks,
    summary,
    passed: summary.error === 0,
  }
}
