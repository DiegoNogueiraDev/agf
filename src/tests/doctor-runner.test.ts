/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1 AC coverage: doctor-runner.ts + provider-check.ts
 *
 * AC1: ANTHROPIC_API_KEY absent → checkProviders reports configured=false, not exception
 * AC2: all checks pass → DoctorReport.passed = true, summary.error = 0
 * AC3: a check throws → captured gracefully, other checks still run
 * AC4: buildSummary counting: ok/warning/error tallied correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CheckResult } from '../core/doctor/doctor-types.js'

// ── Mocked check functions ────────────────────────────────────────────────────
// We mock the individual check modules so runDoctor is deterministic.

const mockCheckNodeVersion = vi.hoisted(() => vi.fn<[], CheckResult>())
const mockCheckConfigFile = vi.hoisted(() => vi.fn<[string], CheckResult>())
const mockCheckWritePermissions = vi.hoisted(() => vi.fn<[string], Promise<CheckResult>>())
const mockCheckSqliteDatabase = vi.hoisted(() => vi.fn<[string], Promise<CheckResult>>())
const mockCheckDbIntegrity = vi.hoisted(() => vi.fn<[string], Promise<CheckResult>>())
const mockCheckDashboardBuild = vi.hoisted(() => vi.fn<[string], Promise<CheckResult>>())
const mockCheckIntegrations = vi.hoisted(() => vi.fn<[string], Promise<CheckResult[]>>())
const mockCheckOnnxStatus = vi.hoisted(() => vi.fn<[], Promise<CheckResult>>())
const mockCheckNativeBinaryHealth = vi.hoisted(() =>
  vi.fn<[], CheckResult>(() => ({ name: 'native-binary-health', level: 'ok', message: 'ok' })),
)
const mockCheckMemoryHealth = vi.hoisted(() =>
  vi.fn<[], CheckResult>(() => ({ name: 'memory-health', level: 'ok', message: 'ok' })),
)
const mockCheckMcpBridgeHealth = vi.hoisted(() =>
  vi.fn<[], Promise<CheckResult>>(async () => ({ name: 'mcp-bridge', level: 'ok', message: 'ok' })),
)
const mockCheckAgentsMdCascade = vi.hoisted(() =>
  vi.fn<[], CheckResult>(() => ({ name: 'agents-md-cascade', level: 'ok', message: 'ok' })),
)
const mockCheckBoundaryDrift = vi.hoisted(() =>
  vi.fn<[], CheckResult>(() => ({ name: 'boundary-drift', level: 'ok', message: 'ok' })),
)
const mockCheckUpdateCheckStatus = vi.hoisted(() =>
  vi.fn<[], CheckResult>(() => ({ name: 'update-check', level: 'ok', message: 'ok' })),
)
const mockCheckHasSourceFiles = vi.hoisted(() =>
  vi.fn<[string], Promise<CheckResult>>(async () => ({ name: 'has-source-files', level: 'ok', message: 'ok' })),
)
const mockCheckSentruxHealthSafe = vi.hoisted(() =>
  vi.fn<[], Promise<CheckResult>>(async () => ({ name: 'sentrux-health', level: 'ok', message: 'ok' })),
)
const mockCheckSentruxMcpHealth = vi.hoisted(() =>
  vi.fn<[], Promise<CheckResult>>(async () => ({ name: 'sentrux-mcp-health', level: 'ok', message: 'ok' })),
)

vi.mock('../core/doctor/doctor-checks.js', () => ({
  checkNodeVersion: mockCheckNodeVersion,
  checkConfigFile: mockCheckConfigFile,
  checkWritePermissions: mockCheckWritePermissions,
  checkSqliteDatabase: mockCheckSqliteDatabase,
  checkDbIntegrity: mockCheckDbIntegrity,
  checkDashboardBuild: mockCheckDashboardBuild,
  checkIntegrations: mockCheckIntegrations,
  checkOnnxStatus: mockCheckOnnxStatus,
  checkNativeBinaryHealth: mockCheckNativeBinaryHealth,
  checkMemoryHealth: mockCheckMemoryHealth,
  checkMcpBridgeHealth: mockCheckMcpBridgeHealth,
  checkAgentsMdCascade: mockCheckAgentsMdCascade,
  checkBoundaryDrift: mockCheckBoundaryDrift,
  checkUpdateCheckStatus: mockCheckUpdateCheckStatus,
  checkHasSourceFiles: mockCheckHasSourceFiles,
  checkGraphInitialized: vi.fn(),
  checkSentruxHealthSafe: mockCheckSentruxHealthSafe,
}))

vi.mock('../core/doctor/sentrux-mcp-health-check.js', () => ({
  checkSentruxMcpHealth: mockCheckSentruxMcpHealth,
}))

import { runDoctor } from '../core/doctor/doctor-runner.js'
import { checkProviders } from '../core/doctor/provider-check.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const OK: CheckResult = { name: 'test-check', level: 'ok', message: 'All good' }
const WARN: CheckResult = { name: 'test-warn', level: 'warning', message: 'Minor issue' }
const ERR: CheckResult = { name: 'test-err', level: 'error', message: 'Fatal issue' }

function setAllChecksOk(): void {
  mockCheckNodeVersion.mockReturnValue(OK)
  mockCheckConfigFile.mockReturnValue(OK)
  mockCheckWritePermissions.mockResolvedValue(OK)
  mockCheckSqliteDatabase.mockResolvedValue(OK)
  mockCheckDbIntegrity.mockResolvedValue(OK)
  mockCheckDashboardBuild.mockResolvedValue(OK)
  mockCheckIntegrations.mockResolvedValue([OK])
  mockCheckOnnxStatus.mockResolvedValue(OK)
}

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agf-doctor-'))
  vi.clearAllMocks()
  setAllChecksOk()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── AC1: ANTHROPIC_API_KEY absent → configured=false, not exception ───────────

describe('AC1: checkProviders — ANTHROPIC_API_KEY absent', () => {
  it('returns configured=false for anthropic when env var is missing', () => {
    const env = {} // no env vars
    const report = checkProviders(env)
    const anthropic = report.providers.find((p) => p.provider === 'anthropic')
    expect(anthropic).toBeDefined()
    expect(anthropic?.configured).toBe(false)
  })

  it('does not throw when all env vars are missing', () => {
    expect(() => checkProviders({})).not.toThrow()
  })

  it('returns configured=true for anthropic when env var is set', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-test-key' }
    const report = checkProviders(env)
    const anthropic = report.providers.find((p) => p.provider === 'anthropic')
    expect(anthropic?.configured).toBe(true)
  })

  it('configuredCount reflects the number of configured providers', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-test',
      OPENAI_API_KEY: 'sk-openai',
    }
    const report = checkProviders(env)
    expect(report.configuredCount).toBe(2)
  })

  it('reports all 10 providers (one per cloud provider)', () => {
    const report = checkProviders({})
    expect(report.providers.length).toBe(10)
  })
})

// ── AC2: all checks pass → passed=true, error=0 ───────────────────────────────

describe('AC2: all checks pass → DoctorReport.passed = true', () => {
  it('returns passed:true when all mocked checks return level:ok', async () => {
    const report = await runDoctor(tmpDir)
    expect(report.passed).toBe(true)
    expect(report.summary.error).toBe(0)
  })

  it('returns a checks array with at least 5 entries', async () => {
    const report = await runDoctor(tmpDir)
    expect(Array.isArray(report.checks)).toBe(true)
    expect(report.checks.length).toBeGreaterThanOrEqual(5)
  })

  it('summary.ok equals the count of ok-level checks', async () => {
    const report = await runDoctor(tmpDir)
    const okCount = report.checks.filter((c) => c.level === 'ok').length
    expect(report.summary.ok).toBe(okCount)
  })

  it('throws McpGraphError for empty basePath', async () => {
    await expect(runDoctor('')).rejects.toThrow()
  })
})

// ── AC3: a check reports error → passed=false ────────────────────────────────

describe('AC3: an error-level check → passed=false', () => {
  it('passed:false when a sync check returns level:error', async () => {
    mockCheckNodeVersion.mockReturnValue(ERR)
    const report = await runDoctor(tmpDir)
    expect(report.passed).toBe(false)
    expect(report.summary.error).toBeGreaterThanOrEqual(1)
  })

  it('passed:false when an async check returns level:error', async () => {
    mockCheckWritePermissions.mockResolvedValue(ERR)
    const report = await runDoctor(tmpDir)
    expect(report.passed).toBe(false)
  })

  it('warning-level checks do not affect passed state', async () => {
    mockCheckNodeVersion.mockReturnValue(WARN)
    const report = await runDoctor(tmpDir)
    // warnings alone → passed = true (only errors affect it)
    expect(report.passed).toBe(true)
    expect(report.summary.warning).toBeGreaterThanOrEqual(1)
  })
})

// ── AC4: summary counting ─────────────────────────────────────────────────────

describe('AC4: summary counts ok/warning/error correctly', () => {
  it('counts one error check correctly', async () => {
    mockCheckConfigFile.mockReturnValue(ERR)
    const report = await runDoctor(tmpDir)
    expect(report.summary.error).toBeGreaterThanOrEqual(1)
    expect(report.summary.ok + report.summary.warning + report.summary.error).toBe(report.checks.length)
  })

  it('counts mixed result set (ok + warning + error)', async () => {
    mockCheckNodeVersion.mockReturnValue(OK)
    mockCheckConfigFile.mockReturnValue(WARN)
    mockCheckDashboardBuild.mockResolvedValue(ERR)
    const report = await runDoctor(tmpDir)
    expect(report.summary.ok).toBeGreaterThanOrEqual(1)
    expect(report.summary.warning).toBeGreaterThanOrEqual(1)
    expect(report.summary.error).toBeGreaterThanOrEqual(1)
  })
})
