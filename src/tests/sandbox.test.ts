/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for src/core/sandbox/ — stack detector, fallback resolver,
 * builder executor, reporter, schemas
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

function toolAvailable(name: string): boolean {
  try {
    execSync(`${name} --version`, { stdio: 'pipe' })
    // For container runtimes, also verify the daemon is responsive
    if (name === 'docker' || name === 'podman') {
      execSync(`${name} info`, { stdio: 'pipe' })
    }
    return true
  } catch {
    return false
  }
}

const hasDocker = toolAvailable('docker')
const hasPodman = toolAvailable('podman')
import { detectStack } from '../core/sandbox/stack-detector.js'
import type { StackDetectionResult } from '../core/sandbox/stack-detector.js'
import { FallbackResolver, FallbackResultSchema } from '../core/sandbox/fallback-resolver.js'
import type { ToolAvailability, FallbackResult } from '../core/sandbox/fallback-resolver.js'
import { executeBuild, buildContainerArgs } from '../core/sandbox/builder-executor.js'
import type { BuilderResult, BuilderExecutorOptions } from '../core/sandbox/builder-executor.js'
import { SandboxError } from '../core/errors/sandbox-error.js'
import { updateGraphFromReport } from '../core/sandbox/reporter.js'
import type { ReporterOutcome, GraphUpdateResult } from '../core/sandbox/reporter.js'
import {
  SandboxBuilderConfigSchema,
  IsolationStrategySchema,
  SandboxCacheConfigSchema,
  BuilderExecutorConfigSchema,
  SandboxReportSchema,
  SANDBOX_ARCHITECTURE,
} from '../core/sandbox/sandbox-architecture.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface NodeFixture {
  id: string
  title: string
  status: string
  type: string
}

interface StoreMock {
  getNodeById: ReturnType<typeof vi.fn>
  updateNodeStatus: ReturnType<typeof vi.fn>
}

function createMockStore(nodes: NodeFixture[]): StoreMock {
  return {
    getNodeById: vi.fn((id: string) => {
      const node = nodes.find((n) => n.id === id)
      return node ? { ...node } : undefined
    }),
    updateNodeStatus: vi.fn(),
  }
}

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'sandbox-test-'))
}

function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

// ─── Stack Detector ───────────────────────────────────────────────────────────

describe('detectStack', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tmpDir)
  })

  it('detects npm from package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('npm')
    expect(result.confidence).toBe(0.5)
    expect(result.evidence).toEqual(['package.json'])
  })

  it('detects npm with lock file for full confidence', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}')
    writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('npm')
    expect(result.confidence).toBe(1)
    expect(result.evidence).toContain('package-lock.json')
  })

  it('detects maven from pom.xml', () => {
    writeFileSync(join(tmpDir, 'pom.xml'), '<project/>')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('maven')
    expect(result.confidence).toBe(0.5)
  })

  it('detects gradle from build.gradle', () => {
    writeFileSync(join(tmpDir, 'build.gradle'), '')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('gradle')
  })

  it('detects gradle from build.gradle.kts', () => {
    writeFileSync(join(tmpDir, 'build.gradle.kts'), '')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('gradle')
  })

  it('detects go from go.mod', () => {
    writeFileSync(join(tmpDir, 'go.mod'), 'module test')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('go')
  })

  it('detects go with go.sum for full confidence', () => {
    writeFileSync(join(tmpDir, 'go.mod'), 'module test')
    writeFileSync(join(tmpDir, 'go.sum'), '')
    const result = detectStack(tmpDir)
    expect(result.confidence).toBe(1)
  })

  it('detects pip from requirements.txt', () => {
    writeFileSync(join(tmpDir, 'requirements.txt'), 'requests')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('pip')
  })

  it('detects pip from pyproject.toml', () => {
    writeFileSync(join(tmpDir, 'pyproject.toml'), '[project]')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('pip')
  })

  it('returns auto with 0 confidence when no markers found', () => {
    writeFileSync(join(tmpDir, 'README.md'), '# project')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('auto')
    expect(result.confidence).toBe(0)
    expect(result.evidence).toEqual([])
  })

  it('throws McpGraphError for non-existent directory', () => {
    expect(() => detectStack(join(tmpDir, 'nonexistent'))).toThrow(/does not exist/)
  })

  it('npm takes priority over maven (npm first in probes)', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}')
    writeFileSync(join(tmpDir, 'pom.xml'), '<project/>')
    const result = detectStack(tmpDir)
    expect(result.stack).toBe('npm')
  })
})

// ─── FallbackResolver ─────────────────────────────────────────────────────────

describe('FallbackResolver', () => {
  let resolver: FallbackResolver

  beforeEach(() => {
    resolver = new FallbackResolver()
  })

  it('resolves docker when available', () => {
    const tools: ToolAvailability = { docker: true, podman: false, process: true }
    const result = resolver.resolveExecutionMode(tools)
    expect(result.executionMode).toBe('docker')
    expect(result.reason).toContain('Docker')
    expect(result.fallbackChain).toEqual(['docker'])
  })

  it('falls back to podman when docker unavailable', () => {
    const tools: ToolAvailability = { docker: false, podman: true, process: true }
    const result = resolver.resolveExecutionMode(tools)
    expect(result.executionMode).toBe('podman')
    expect(result.reason).toContain('Podman')
    expect(result.fallbackChain).toEqual(['docker', 'podman'])
  })

  it('falls back to process when docker and podman unavailable', () => {
    const tools: ToolAvailability = { docker: false, podman: false, process: true }
    const result = resolver.resolveExecutionMode(tools)
    expect(result.executionMode).toBe('process')
    expect(result.reason).toContain('process')
    expect(result.fallbackChain).toEqual(['docker', 'podman', 'process'])
  })

  it('returns error when all modes unavailable', () => {
    const tools: ToolAvailability = { docker: false, podman: false, process: false }
    const result = resolver.resolveExecutionMode(tools)
    expect(result.executionMode).toBe('error')
    expect(result.reason).toContain('No isolation method')
    expect(result.fallbackChain).toEqual(['docker', 'podman', 'process'])
  })

  it('result validates against FallbackResultSchema', () => {
    const tools: ToolAvailability = { docker: true, podman: false, process: true }
    const result = resolver.resolveExecutionMode(tools)
    expect(() => {
      const parsed = FallbackResultSchema.parse(result)
    }).not.toThrow()
  })

  it('always adds docker first to chain regardless of availability', () => {
    const tools: ToolAvailability = { docker: false, podman: false, process: true }
    const result = resolver.resolveExecutionMode(tools)
    expect(result.fallbackChain[0]).toBe('docker')
  })

  it('checkDockerAvailability returns boolean', async () => {
    const available = await resolver.checkDockerAvailability()
    expect(typeof available).toBe('boolean')
  })

  it('checkPodmanAvailability returns boolean', async () => {
    const available = await resolver.checkPodmanAvailability()
    expect(typeof available).toBe('boolean')
  })

  it('checkProcessAvailability always returns true', async () => {
    const available = await resolver.checkProcessAvailability()
    expect(available).toBe(true)
  })
})

// ─── Builder Executor ─────────────────────────────────────────────────────────

describe('executeBuild', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tmpDir)
  })

  it('executes a command successfully', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'process.stdout.write("ok")'],
      isolation: 'process',
    })
    expect(result.success).toBe(true)
    expect(result.status).toBe('success')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('ok')
  })

  it('throws SandboxError for an unsupported isolation value (node_wire_e6cbf52b518b)', async () => {
    await expect(
      executeBuild({
        command: 'node',
        isolation: 'unsupported-runtime' as unknown as BuilderExecutorOptions['isolation'],
      }),
    ).rejects.toThrow(SandboxError)
  })

  it('captures stdout and stderr', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'process.stdout.write("out"); process.stderr.write("err")'],
      isolation: 'process',
    })
    expect(result.stdout).toContain('out')
    expect(result.stderr).toContain('err')
  })

  it('reports failure on non-zero exit', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'process.exit(1)'],
      isolation: 'process',
    })
    expect(result.success).toBe(false)
    expect(result.status).toBe('failure')
    expect(result.exitCode).toBe(1)
  })

  it('reports error on spawn failure', async () => {
    const result = await executeBuild({
      command: '/does/not/exist/command',
      isolation: 'process',
    })
    expect(result.success).toBe(false)
    expect(result.status).toBe('error')
    expect(result.exitCode).toBeNull()
  })

  it('works in custom workDir', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'process.stdout.write(process.cwd())'],
      workDir: tmpDir,
      isolation: 'process',
    })
    expect(result.success).toBe(true)
    expect(result.stdout).toContain(tmpDir)
  })

  it('passes extra env vars', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'process.stdout.write(process.env.MY_VAR ?? "")'],
      isolation: 'process',
      env: { MY_VAR: 'hello' },
    })
    expect(result.stdout).toContain('hello')
  })

  it('buildContainerArgs constructs correct docker args', () => {
    const args = buildContainerArgs('docker', 'node:20', '/tmp/test', 'npm', ['test'])
    expect(args).toEqual(['run', '--rm', '-v', '/tmp/test:/work', '-w', '/work', 'node:20', 'npm', 'test'])
  })

  it('buildContainerArgs uses correct runtime for podman', () => {
    const args = buildContainerArgs('podman', 'alpine:latest', '/workspace', 'echo', ['hello', 'world'])
    expect(args[0]).toBe('run')
    expect(args).toContain('alpine:latest')
    expect(args).toContain('echo')
    expect(args).toContain('hello')
    expect(args).toContain('world')
  })

  it('buildContainerArgs mounts workDir correctly', () => {
    const args = buildContainerArgs('docker', 'node:20', '/my/project', 'ls', [])
    expect(args).toContain('-v')
    expect(args).toContain('/my/project:/work')
    expect(args).toContain('-w')
    expect(args).toContain('/work')
  })

  it('buildContainerArgs includes --rm flag', () => {
    const args = buildContainerArgs('docker', 'node:20', '/tmp/test', 'echo', ['x'])
    expect(args).toContain('--rm')
  })
  ;(hasDocker ? it : it.skip)('executeBuild with docker isolation reports docker in result', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'console.log("ok")'],
      isolation: 'docker',
    })
    expect(result.isolation).toBe('docker')
    expect(result.success).toBe(true)
  })
  ;(hasPodman ? it : it.skip)('executeBuild with podman isolation reports podman in result', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'console.log("ok")'],
      isolation: 'podman',
    })
    expect(result.isolation).toBe('podman')
    expect(result.success).toBe(true)
  })
  ;(hasDocker ? it : it.skip)('uses custom containerImage for docker isolation', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'console.log("ok")'],
      isolation: 'docker',
      containerImage: 'alpine:latest',
    })
    expect(result.isolation).toBe('docker')
  })

  it('process isolation does not throw', async () => {
    await expect(executeBuild({ command: 'node', args: ['-e', '1+1'], isolation: 'process' })).resolves.toBeDefined()
  })

  it('process isolation does not throw', async () => {
    await expect(executeBuild({ command: 'node', args: ['-e', '1+1'], isolation: 'process' })).resolves.toBeDefined()
  })

  it('respects timeout and returns timeout status', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'setTimeout(() => {}, 50000)'],
      isolation: 'process',
      timeoutMs: 50,
    })
    expect(result.success).toBe(false)
    expect(result.status).toBe('timeout')
  })

  it('returns profile in result', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'console.log("hi")'],
      isolation: 'process',
      profile: 'full',
    })
    expect(result.profile).toBe('full')
  })

  it('returns isolation type in result', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'console.log("hi")'],
      isolation: 'process',
    })
    expect(result.isolation).toBe('process')
  })

  it('populates durationMs', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', 'console.log("hi")'],
      isolation: 'process',
    })
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it('defaults profile to ci-mirror', async () => {
    const result = await executeBuild({
      command: 'node',
      args: ['-e', '1+1'],
      isolation: 'process',
    })
    expect(result.profile).toBe('ci-mirror')
  })
})

// ─── Reporter ─────────────────────────────────────────────────────────────────

describe('updateGraphFromReport', () => {
  let store: StoreMock

  function mockNode(id: string, status: string) {
    return { id, title: 'test', status, type: 'task' }
  }

  it('blocks backlog task on failure', () => {
    store = createMockStore([mockNode('n1', 'backlog')])
    const report: ReporterOutcome = { success: false, status: 'failure' }
    const result = updateGraphFromReport(store as never, 'n1', report)
    expect(result.newStatus).toBe('blocked')
    expect(result.previousStatus).toBe('backlog')
    expect(store.updateNodeStatus).toHaveBeenCalledWith('n1', 'blocked')
  })

  it('blocks ready task on failure', () => {
    store = createMockStore([mockNode('n1', 'ready')])
    const result = updateGraphFromReport(store as never, 'n1', { success: false })
    expect(result.newStatus).toBe('blocked')
  })

  it('blocks in_progress task on failure', () => {
    store = createMockStore([mockNode('n1', 'in_progress')])
    const result = updateGraphFromReport(store as never, 'n1', { success: false })
    expect(result.newStatus).toBe('blocked')
  })

  it('skips already blocked task on failure', () => {
    store = createMockStore([mockNode('n1', 'blocked')])
    const result = updateGraphFromReport(store as never, 'n1', { success: false })
    expect(result.newStatus).toBeNull()
    expect(result.skipped).toContain('already blocked')
    expect(store.updateNodeStatus).not.toHaveBeenCalled()
  })

  it('freezes done task — never writes', () => {
    store = createMockStore([mockNode('n1', 'done')])
    const resultFail = updateGraphFromReport(store as never, 'n1', { success: false })
    expect(resultFail.newStatus).toBeNull()
    expect(resultFail.skipped).toContain('done')

    const resultSuccess = updateGraphFromReport(store as never, 'n1', { success: true })
    expect(resultSuccess.newStatus).toBeNull()
    expect(store.updateNodeStatus).not.toHaveBeenCalled()
  })

  it('unblocks blocked task on success', () => {
    store = createMockStore([mockNode('n1', 'blocked')])
    const result = updateGraphFromReport(store as never, 'n1', { success: true })
    expect(result.newStatus).toBe('in_progress')
    expect(store.updateNodeStatus).toHaveBeenCalledWith('n1', 'in_progress')
  })

  it('skips non-blocked task on success (no change)', () => {
    store = createMockStore([mockNode('n1', 'backlog')])
    const result = updateGraphFromReport(store as never, 'n1', { success: true })
    expect(result.newStatus).toBeNull()
    expect(result.skipped).toContain('no change')
    expect(store.updateNodeStatus).not.toHaveBeenCalled()
  })

  it('throws NodeNotFoundError for missing node', () => {
    store = createMockStore([])
    expect(() => updateGraphFromReport(store as never, 'n1', { success: true })).toThrow()
  })
})

// ─── Sandbox Architecture Schemas ──────────────────────────────────────────────

describe('SandboxBuilderConfigSchema', () => {
  it('parses valid config with defaults', () => {
    const result = SandboxBuilderConfigSchema.parse({
      projectDir: '/tmp/project',
    })
    expect(result.projectDir).toBe('/tmp/project')
    expect(result.stack).toBe('auto')
    expect(result.timeout).toBe(300000)
    expect(result.isolation).toBe('auto')
  })

  it('rejects empty projectDir', () => {
    expect(() => SandboxBuilderConfigSchema.parse({ projectDir: '' })).toThrow()
  })

  it('accepts optional fields', () => {
    const result = SandboxBuilderConfigSchema.parse({
      projectDir: '/p',
      stack: 'npm',
      timeout: 60000,
      isolation: 'docker',
      image: 'node:20',
      cacheDir: '/cache',
      env: { NODE_ENV: 'test' },
      workDir: 'sub',
    })
    expect(result.stack).toBe('npm')
    expect(result.image).toBe('node:20')
    expect(result.env).toEqual({ NODE_ENV: 'test' })
  })
})

describe('IsolationStrategySchema', () => {
  it('parses valid strategy', () => {
    const result = IsolationStrategySchema.parse({
      mode: 'docker',
      available: true,
      fallbackChain: ['docker', 'podman', 'process'],
      isolationGuarantee: 'strong',
    })
    expect(result.mode).toBe('docker')
    expect(result.isolationGuarantee).toBe('strong')
  })

  it('rejects empty fallbackChain', () => {
    expect(() =>
      IsolationStrategySchema.parse({
        mode: 'process',
        available: true,
        fallbackChain: [],
        isolationGuarantee: 'weak',
      }),
    ).toThrow()
  })

  it('accepts optional image', () => {
    const result = IsolationStrategySchema.parse({
      mode: 'docker',
      available: true,
      image: 'node:20',
      fallbackChain: ['docker'],
      isolationGuarantee: 'strong',
    })
    expect(result.image).toBe('node:20')
  })
})

describe('SandboxCacheConfigSchema', () => {
  it('parses valid cache config', () => {
    const result = SandboxCacheConfigSchema.parse({
      cacheDir: '/cache',
      fingerprintStrategy: 'content-hash',
      ttlMs: 3600000,
      invalidationTriggers: ['dependency-change'],
    })
    expect(result.maxSizeBytes).toBe(104857600)
  })

  it('rejects missing required fields', () => {
    expect(() =>
      SandboxCacheConfigSchema.parse({
        fingerprintStrategy: 'content-hash',
      }),
    ).toThrow()
  })
})

describe('BuilderExecutorConfigSchema', () => {
  it('parses valid executor config', () => {
    const result = BuilderExecutorConfigSchema.parse({
      phases: ['compile', 'test'],
      command: 'npm test',
      timeoutMs: 300000,
      killSignal: 'SIGKILL',
      hardKillOnTimeout: true,
      captureStdout: true,
      captureStderr: true,
      profile: 'ci-mirror',
    })
    expect(result.phases).toEqual(['compile', 'test'])
  })

  it('rejects empty phases', () => {
    expect(() =>
      BuilderExecutorConfigSchema.parse({
        phases: [],
        command: 'npm test',
        timeoutMs: 300000,
        killSignal: 'SIGKILL',
        hardKillOnTimeout: true,
        captureStdout: true,
        captureStderr: true,
        profile: 'ci-mirror',
      }),
    ).toThrow()
  })

  it('requires hardKillOnTimeout to be true', () => {
    expect(() =>
      BuilderExecutorConfigSchema.parse({
        phases: ['test'],
        command: 'npm test',
        timeoutMs: 300000,
        killSignal: 'SIGKILL',
        hardKillOnTimeout: false,
        captureStdout: true,
        captureStderr: true,
        profile: 'ci-mirror',
      }),
    ).toThrow()
  })
})

describe('SandboxReportSchema', () => {
  it('parses valid report', () => {
    const result = SandboxReportSchema.parse({
      status: 'success',
      executionMode: 'process',
      profile: 'ci-mirror',
      durationMs: 1200,
      cacheHit: false,
      cacheKey: 'abc123',
      testResults: {
        format: 'jest',
        totalTests: 10,
        passedTests: 8,
        failedTests: 1,
        skippedTests: 1,
        success: false,
      },
      timestamp: new Date().toISOString(),
    })
    expect(result.status).toBe('success')
    expect(result.testResults.passedTests).toBe(8)
  })

  it('accepts optional evidence', () => {
    const result = SandboxReportSchema.parse({
      status: 'failure',
      executionMode: 'docker',
      profile: 'full',
      durationMs: 500,
      cacheHit: true,
      cacheKey: 'def456',
      testResults: {
        format: 'surefire',
        totalTests: 5,
        passedTests: 5,
        failedTests: 0,
        skippedTests: 0,
        success: true,
      },
      timestamp: new Date().toISOString(),
      evidence: {
        nodeId: 'n1',
        updatedAt: new Date().toISOString(),
      },
    })
    expect(result.evidence).toBeDefined()
    expect(result.evidence?.nodeId).toBe('n1')
  })
})

describe('SANDBOX_ARCHITECTURE', () => {
  it('has 5 layers', () => {
    expect(SANDBOX_ARCHITECTURE.layers).toHaveLength(5)
  })

  it('has isolation fallback chain', () => {
    expect(SANDBOX_ARCHITECTURE.isolationFallbackChain).toEqual(['docker', 'podman', 'process'])
  })

  it('has supported stacks', () => {
    expect(SANDBOX_ARCHITECTURE.supportedStacks).toContain('npm')
    expect(SANDBOX_ARCHITECTURE.supportedStacks).toContain('maven')
    expect(SANDBOX_ARCHITECTURE.supportedStacks).toContain('auto')
  })

  it('has key constraints with hard isolation guarantee', () => {
    expect(SANDBOX_ARCHITECTURE.constraints.isolationGuarantee.enforcement).toBe('hard')
    expect(SANDBOX_ARCHITECTURE.constraints.timeoutHandling.hardKill).toBe(true)
  })
})
