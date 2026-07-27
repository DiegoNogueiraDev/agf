/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Wave-12 Sandbox Build — Functional Architecture Schemas
 *
 * Defines the complete 5-layer functional architecture for the Sandbox Build System.
 * All schemas are Zod v4, strict mode, exported for RAG indexing.
 *
 * Layers:
 *   L1 — InputLayer    (SandboxBuilderConfigSchema)    — user-facing build config
 *   L2 — IsolationLayer (IsolationStrategySchema)      — Docker/Podman/Process chain
 *   L3 — CacheLayer    (SandboxCacheConfigSchema)      — fingerprint-based caching
 *   L4 — RunnerLayer   (BuilderExecutorConfigSchema)   — compile/test/timeout handling
 *   L5 — OutputLayer   (SandboxReportSchema)           — TestParseResult + evidence
 *
 * Key constraints (see KeyConstraintsSchema):
 *   - Isolation guarantee: no cross-test pollution
 *   - Timeout: hard kill with SIGKILL
 *   - Cache invalidation: on dependency/config/env changes (SHA-256)
 *   - Test result fidelity: surefire/junit/jest/go-test
 *   - Cross-platform: Docker/Podman/Process on Linux/Mac/Windows
 */

import { z } from 'zod/v4'

// ─── L1: Input Layer ────────────────────────────────────────────────────────────

/**
 * Supported build/test stacks.
 * "auto" = auto-detect from project structure (package.json, pom.xml, go.mod, etc.)
 */
export const SandboxStackSchema = z.enum(['maven', 'gradle', 'npm', 'go', 'pip', 'auto'])

/**
 * Supported isolation modes.
 * "auto" = resolve at runtime using Docker → Podman → Process fallback chain.
 */
export const SandboxIsolationModeSchema = z.enum(['docker', 'podman', 'process', 'auto'])

/**
 * L1 — Input Layer: SandboxBuilderConfig
 *
 * Entry point for the sandbox build pipeline. Captures user intent:
 * which project to build, which stack, how long, and which isolation mode.
 *
 * @field projectDir   Absolute path to the project root
 * @field stack        Build stack: maven/gradle/npm/go/pip/auto
 * @field timeout      Hard timeout in ms (default: 300000 = 5 min)
 * @field isolation    Isolation mode (default: auto → Docker → Podman → Process)
 * @field image        Optional container image override
 * @field cacheDir     Optional directory for build artifact cache
 * @field env          Optional environment variables injected into the build
 * @field workDir      Optional subdirectory inside projectDir to run the build
 */
export const SandboxBuilderConfigSchema = z.object({
  projectDir: z.string().min(1).describe('Absolute path to project root'),
  stack: SandboxStackSchema.default('auto').describe('Build/test stack'),
  timeout: z.number().min(1).default(300000).describe('Hard timeout in ms'),
  isolation: SandboxIsolationModeSchema.default('auto').describe('Isolation mode'),
  image: z.string().optional().describe('Container image override (Docker/Podman)'),
  cacheDir: z.string().optional().describe('Build artifact cache directory'),
  env: z.record(z.string(), z.string()).optional().describe('Environment variables'),
  workDir: z.string().optional().describe('Working subdirectory inside projectDir'),
})

export type SandboxBuilderConfig = z.infer<typeof SandboxBuilderConfigSchema>

// ─── L2: Isolation Layer ────────────────────────────────────────────────────────

/**
 * Isolation guarantee levels.
 * "strong" = container-level isolation (Docker/Podman).
 * "weak"   = process-level isolation (separate child process, shared OS).
 */
export const IsolationGuaranteeSchema = z.enum(['strong', 'weak'])

/**
 * L2 — Isolation Layer: IsolationStrategy
 *
 * Resolved at runtime after checking tool availability.
 * Enforces the no-cross-test-pollution constraint.
 *
 * Fallback chain: Docker → Podman → Process
 * - Docker: full container isolation (strong guarantee)
 * - Podman: rootless container isolation (strong guarantee)
 * - Process: isolated tmpdir + child process (weak guarantee)
 *
 * @field mode               Resolved isolation mode
 * @field available          Whether the mode is currently available
 * @field image              Container image (docker/podman only)
 * @field fallbackChain      Ordered list of modes tried (min 1 entry)
 * @field isolationGuarantee Strength of isolation
 */
export const IsolationStrategySchema = z.object({
  mode: z.enum(['docker', 'podman', 'process']).describe('Resolved isolation mode'),
  available: z.boolean().describe('Whether this mode is available on the system'),
  image: z.string().optional().describe('Container image (docker/podman only)'),
  fallbackChain: z
    .array(z.enum(['docker', 'podman', 'process']))
    .min(1)
    .describe('Ordered fallback chain (min 1 entry — isolation guarantee requires at least one mode)'),
  isolationGuarantee: IsolationGuaranteeSchema.describe('strong=container-level, weak=process-level'),
})

export type IsolationStrategy = z.infer<typeof IsolationStrategySchema>

// ─── L3: Cache Layer ────────────────────────────────────────────────────────────

/**
 * Cache fingerprint strategy.
 * "content-hash" = SHA-256 of deps + config + env.
 * "command-hash" = SHA-256 of the exact command string only.
 * "none"         = caching disabled.
 */
export const FingerprintStrategySchema = z.enum(['content-hash', 'command-hash', 'none'])

/**
 * Cache invalidation triggers.
 * Defines conditions under which a cached result is discarded.
 */
export const CacheInvalidationTriggerSchema = z.enum([
  'dependency-change',
  'config-change',
  'env-change',
  'time-expiry',
  'manual',
])

/**
 * L3 — Cache Layer: SandboxCacheConfig
 *
 * Fingerprint-based cache to skip redundant builds.
 * Invalidated when dependencies, config, or env change (SHA-256 content hash).
 *
 * @field cacheDir              Absolute path to cache storage directory
 * @field fingerprintStrategy   How to compute cache keys
 * @field ttlMs                 Cache TTL in ms (0 = no expiry)
 * @field invalidationTriggers  Events that invalidate cached entries
 * @field maxSizeBytes          Max total cache size (default: 100MB)
 */
export const SandboxCacheConfigSchema = z.object({
  cacheDir: z.string().min(1).describe('Cache storage directory'),
  fingerprintStrategy: FingerprintStrategySchema.describe('Cache key strategy'),
  ttlMs: z.number().min(0).describe('Cache TTL in ms (0 = no expiry)'),
  invalidationTriggers: z.array(CacheInvalidationTriggerSchema).describe('Events that invalidate cache entries'),
  maxSizeBytes: z.number().min(0).default(104857600).describe('Max total cache size in bytes (default: 100MB)'),
})

export type SandboxCacheConfig = z.infer<typeof SandboxCacheConfigSchema>

// ─── L4: Runner Layer ───────────────────────────────────────────────────────────

/**
 * Build execution phases.
 * Each phase maps to a specific stage in the CI pipeline.
 */
export const BuildPhaseSchema = z.enum(['compile', 'test', 'lint', 'report'])

/**
 * Kill signals for timeout enforcement.
 * SIGKILL = hard kill (cannot be caught or ignored).
 * SIGTERM = graceful shutdown (can be caught for cleanup).
 */
export const KillSignalSchema = z.enum(['SIGKILL', 'SIGTERM'])

/**
 * L4 — Runner Layer: BuilderExecutorConfig
 *
 * Drives the actual build/test execution.
 * Enforces timeout with hard kill (SIGKILL by default).
 *
 * @field phases           Ordered list of phases to execute (min 1)
 * @field command          Shell command to execute
 * @field timeoutMs        Hard timeout in ms (positive int > 0)
 * @field killSignal       Signal sent on timeout (SIGKILL = hard kill)
 * @field hardKillOnTimeout  Must be true — enforces timeout constraint
 * @field captureStdout    Whether to capture stdout for parsing
 * @field captureStderr    Whether to capture stderr for diagnostics
 * @field profile          Execution profile: ci-mirror/fast/full
 */
export const BuilderExecutorConfigSchema = z.object({
  phases: z.array(BuildPhaseSchema).min(1).describe('Ordered execution phases (must have at least one)'),
  command: z.string().min(1).describe('Shell command to execute'),
  timeoutMs: z.number().min(1).describe('Hard timeout in ms (must be > 0)'),
  killSignal: KillSignalSchema.describe('Signal on timeout'),
  hardKillOnTimeout: z.literal(true).describe('MUST be true — timeout constraint requires hard kill'),
  captureStdout: z.boolean().describe('Capture stdout for test result parsing'),
  captureStderr: z.boolean().describe('Capture stderr for diagnostics'),
  profile: z.enum(['ci-mirror', 'fast', 'full']).describe('Execution profile'),
})

export type BuilderExecutorConfig = z.infer<typeof BuilderExecutorConfigSchema>

// ─── L5: Output Layer ──────────────────────────────────────────────────────────

/**
 * Sandbox execution status.
 * Maps directly to BuilderResult.status in builder-executor.ts.
 */
export const SandboxExecutionStatusSchema = z.enum(['success', 'failure', 'timeout', 'error'])

/**
 * Supported test result formats.
 * Parsed by reporter.ts (parseTestResultsMultiFormat).
 */
export const TestReportFormatSchema = z.enum(['surefire', 'junit', 'jest', 'go-test'])

/**
 * Parsed test result metrics — format-agnostic.
 * Produced by the multi-format parser in reporter.ts.
 */
export const ParsedTestResultSchema = z.object({
  format: TestReportFormatSchema.describe('Detected/specified test format'),
  totalTests: z.number().min(0),
  passedTests: z.number().min(0),
  failedTests: z.number().min(0),
  skippedTests: z.number().min(0),
  success: z.boolean(),
  durationMs: z.number().optional(),
  errorMessage: z.string().optional(),
})

/**
 * Evidence attached to the graph node on successful execution.
 */
export const SandboxEvidenceSchema = z.object({
  nodeId: z.string().describe('Graph node ID updated with evidence'),
  updatedAt: z.string().describe('ISO timestamp of last update'),
})

/**
 * L5 — Output Layer: SandboxReport
 *
 * Final execution report combining BuilderResult + TestParseResult + graph evidence.
 * Consumed by the graph mutation layer (sandbox-report.ts, integrateTestResults).
 *
 * @field status          Execution outcome: success/failure/timeout/error
 * @field executionMode   Which isolation mode was used
 * @field profile         Which execution profile was used
 * @field durationMs      Total wall-clock execution time
 * @field cacheHit        Whether result came from cache
 * @field cacheKey        SHA-256 cache key for this execution
 * @field testResults     Parsed test metrics (format-agnostic)
 * @field evidence        Graph node evidence (optional — when updateGraph=true)
 * @field timestamp       ISO timestamp of report generation
 */
export const SandboxReportSchema = z.object({
  status: SandboxExecutionStatusSchema,
  executionMode: z.enum(['docker', 'podman', 'process']),
  profile: z.enum(['ci-mirror', 'fast', 'full']),
  durationMs: z.number().min(0),
  cacheHit: z.boolean(),
  cacheKey: z.string().min(1),
  testResults: ParsedTestResultSchema,
  evidence: SandboxEvidenceSchema.optional(),
  timestamp: z.string().describe('ISO 8601 timestamp'),
})

export type SandboxReport = z.infer<typeof SandboxReportSchema>

// ─── Key Constraints ───────────────────────────────────────────────────────────

/**
 * Constraint enforcement levels.
 * "hard" = must be satisfied — violations cause build failure.
 * "soft" = best-effort — degraded mode allowed.
 */
export const ConstraintEnforcementSchema = z.enum(['hard', 'soft'])

/**
 * Key Constraints for the Sandbox Build System.
 * Documenting non-negotiable architectural invariants.
 */
export const KeyConstraintsSchema = z.object({
  isolationGuarantee: z.object({
    description: z.string(),
    enforcement: ConstraintEnforcementSchema,
    mechanism: z.string().describe('Technical mechanism enforcing isolation'),
  }),
  timeoutHandling: z.object({
    description: z.string(),
    enforcement: ConstraintEnforcementSchema,
    defaultTimeoutMs: z.number().min(1),
    killSignal: KillSignalSchema,
    hardKill: z.literal(true).describe('Must be true — hard kill enforced'),
  }),
  cacheInvalidation: z.object({
    description: z.string(),
    enforcement: ConstraintEnforcementSchema,
    triggers: z.array(CacheInvalidationTriggerSchema).min(1),
    algorithm: z.string().describe('Hash algorithm (sha256, md5, etc.)'),
  }),
  testResultFidelity: z.object({
    description: z.string(),
    enforcement: ConstraintEnforcementSchema,
    supportedFormats: z.array(TestReportFormatSchema).min(1),
  }),
  crossPlatform: z.object({
    description: z.string(),
    enforcement: ConstraintEnforcementSchema,
    platforms: z.array(z.string()).min(1),
    isolationModes: z.array(z.enum(['docker', 'podman', 'process'])).min(1),
  }),
})

export type KeyConstraints = z.infer<typeof KeyConstraintsSchema>

// ─── Functional Architecture Document ─────────────────────────────────────────

/**
 * A single layer description in the architecture document.
 */
export const ArchitectureLayerSchema = z.object({
  id: z.number().describe('Layer index (1-5)'),
  name: z.string().describe('Layer name'),
  description: z.string(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  keyComponents: z.array(z.string()),
  sourceFiles: z.array(z.string()).describe('Relative paths in src/core/sandbox/'),
})

export type ArchitectureLayer = z.infer<typeof ArchitectureLayerSchema>

/**
 * Full functional architecture document for Wave-12 Sandbox Build System.
 * Zod-validated, exported as SANDBOX_ARCHITECTURE constant for RAG indexing.
 */
export const SandboxFunctionalArchitectureSchema = z.object({
  version: z.string(),
  description: z.string(),
  wave: z.literal('wave-12'),
  layers: z.array(ArchitectureLayerSchema).length(5),
  isolationFallbackChain: z.tuple([z.literal('docker'), z.literal('podman'), z.literal('process')]),
  supportedStacks: z.array(SandboxStackSchema),
  supportedFormats: z.array(TestReportFormatSchema),
  constraints: KeyConstraintsSchema,
})

export type SandboxFunctionalArchitecture = z.infer<typeof SandboxFunctionalArchitectureSchema>

// ─── Static Architecture Constant (RAG-indexed) ────────────────────────────────

/**
 * Wave-12 Sandbox Build — Functional Architecture Definition
 *
 * This constant is the authoritative architecture document.
 * It is validated by SandboxFunctionalArchitectureSchema and indexed in the RAG pipeline.
 *
 * Usage:
 *   import { SANDBOX_ARCHITECTURE } from "./sandbox-architecture.js";
 */
export const SANDBOX_ARCHITECTURE: SandboxFunctionalArchitecture = {
  version: '1.0.0',
  wave: 'wave-12',
  description:
    'Wave-12 Sandbox Build System: isolated, reproducible test execution with ' +
    'Docker/Podman/Process fallback chain, SHA-256 fingerprint-based caching, ' +
    'and multi-format test result parsing (surefire/junit/jest/go-test). ' +
    'Enforces 5 hard constraints: isolation guarantee, timeout hard-kill, ' +
    'cache invalidation on dependency changes, test result fidelity, and cross-platform support.',

  isolationFallbackChain: ['docker', 'podman', 'process'],

  supportedStacks: ['maven', 'gradle', 'npm', 'go', 'pip', 'auto'],

  supportedFormats: ['surefire', 'junit', 'jest', 'go-test'],

  layers: [
    {
      id: 1,
      name: 'InputLayer',
      description:
        'Entry point for the sandbox pipeline. Captures user configuration: ' +
        'project directory, build stack, timeout, isolation mode, optional container image, ' +
        'cache directory, environment variables, and working subdirectory. ' +
        'Validated by SandboxBuilderConfigSchema before any execution begins.',
      inputs: ['SandboxBuilderConfig (user-provided)'],
      outputs: ['Validated SandboxBuilderConfig', 'Resolved defaults (stack=auto, timeout=300000, isolation=auto)'],
      keyComponents: ['SandboxBuilderConfigSchema', 'SandboxStackSchema', 'SandboxIsolationModeSchema'],
      sourceFiles: ['sandbox-architecture.ts', 'builder-executor.ts'],
    },
    {
      id: 2,
      name: 'IsolationLayer',
      description:
        'Resolves isolation strategy at runtime using tool availability. ' +
        'Tries Docker first (strong guarantee), falls back to Podman (strong), ' +
        'then process isolation (weak). Enforces no-cross-test-pollution constraint: ' +
        'each execution runs in an isolated tmpdir, never sharing state with other executions.',
      inputs: ['Preferred isolation mode from InputLayer', 'System tool availability'],
      outputs: ['IsolationStrategy (resolved mode + fallbackChain + guarantee level)'],
      keyComponents: ['IsolationStrategySchema', 'FallbackResolver', 'ToolAvailabilitySchema', 'FallbackResultSchema'],
      sourceFiles: ['fallback-resolver.ts', 'sandbox-architecture.ts'],
    },
    {
      id: 3,
      name: 'CacheLayer',
      description:
        'Fingerprint-based cache to skip redundant builds. ' +
        'Computes SHA-256 content hash of (command + stack + profile + env). ' +
        'Cache is invalidated on dependency changes, config changes, or env changes. ' +
        'Cache hit returns prior BuilderResult without re-execution. ' +
        'Cache miss proceeds to RunnerLayer.',
      inputs: ['BuilderConfig fields (command, stack, profile, env)', 'Cache directory path'],
      outputs: ['Cache key (SHA-256 hex string)', 'Cache hit/miss indicator', 'Cached BuilderResult or null'],
      keyComponents: ['SandboxCacheConfigSchema', 'SandboxCache', 'InputFingerprinter', 'CacheSkipResolver'],
      sourceFiles: ['sandbox-cache.ts', 'sandbox-fingerprint.ts', 'sandbox-architecture.ts'],
    },
    {
      id: 4,
      name: 'RunnerLayer',
      description:
        'Executes build/test commands in the resolved isolated environment. ' +
        'Enforces hard timeout with SIGKILL (cannot be ignored). ' +
        'Captures stdout for test result parsing and stderr for diagnostics. ' +
        'Supports phases: compile → test → lint → report. ' +
        'Profiles: ci-mirror (exact CI replication), fast (quick iteration), full (complete with clean cache).',
      inputs: ['Validated BuilderConfig', 'Resolved IsolationStrategy', 'Cache miss signal'],
      outputs: ['BuilderResult (success/failure/timeout/error + output + durationMs + exitCode)'],
      keyComponents: ['BuilderExecutorConfigSchema', 'BuilderExecutor', 'BuilderResultSchema'],
      sourceFiles: ['builder-executor.ts', 'sandbox-architecture.ts'],
    },
    {
      id: 5,
      name: 'OutputLayer',
      description:
        'Combines BuilderResult + multi-format test parsing + graph evidence integration. ' +
        'Parses test output in surefire/junit/jest/go-test formats (auto-detected). ' +
        'On success: attaches test evidence to the graph node (sandboxTestEvidence). ' +
        'On failure: marks node as blocked with sandboxFailureRationale. ' +
        'Produces SandboxReport — the final output consumed by the MCP tool layer.',
      inputs: ['BuilderResult from RunnerLayer', 'Node ID for graph mutation'],
      outputs: [
        'ParsedTestResult (format-agnostic metrics)',
        'SandboxReport (full execution summary)',
        'Graph node mutation (evidence or blocked status)',
      ],
      keyComponents: [
        'SandboxReportSchema',
        'ParsedTestResultSchema',
        'parseTestResultsMultiFormat',
        'integrateTestResults',
        'sandboxReport',
      ],
      sourceFiles: ['reporter.ts', 'sandbox-report.ts', 'build-result-integrator.ts', 'sandbox-architecture.ts'],
    },
  ],

  constraints: {
    isolationGuarantee: {
      description:
        'No cross-test pollution between sandbox executions. ' +
        'Each execution runs in a freshly-created isolated tmpdir. ' +
        'Container modes (Docker/Podman) provide strong filesystem + network isolation. ' +
        'Process mode provides weak isolation via separate child process + isolated workdir.',
      enforcement: 'hard',
      mechanism: 'isolated-tmpdir-per-execution',
    },
    timeoutHandling: {
      description:
        'Hard kill on TIMEOUT — when timeoutMs is exceeded, the process is immediately ' +
        'killed with SIGKILL (cannot be caught or ignored). ' +
        'Prevents zombie processes and resource leaks in CI environments. ' +
        'Exit code 124 is emitted on timeout (POSIX timeout convention). ' +
        "Result status is set to 'timeout' (not 'failure') for observability.",
      enforcement: 'hard',
      defaultTimeoutMs: 300000,
      killSignal: 'SIGKILL',
      hardKill: true,
    },
    cacheInvalidation: {
      description:
        'Cache is invalidated when dependencies, configuration, or environment change. ' +
        'Cache key is the SHA-256 hash of (command + stack + profile + env). ' +
        'Dependency changes detected via package.json/pom.xml/go.sum content hash. ' +
        'Manual invalidation available via BuilderExecutor.invalidateCache(). ' +
        'TTL-based expiry supported for time-sensitive builds.',
      enforcement: 'hard',
      triggers: ['dependency-change', 'config-change', 'env-change'],
      algorithm: 'sha256',
    },
    testResultFidelity: {
      description:
        'Test results are parsed deterministically regardless of format. ' +
        'Supported: surefire (Maven XML), junit (XML), jest (JSON), go-test (plaintext). ' +
        'Auto-detection inspects content before applying parser. ' +
        'Metrics (total/passed/failed/skipped) are normalized into a format-agnostic struct. ' +
        'Parsing errors produce a failed result with errorMessage, never silently corrupt counts.',
      enforcement: 'hard',
      supportedFormats: ['surefire', 'junit', 'jest', 'go-test'],
    },
    crossPlatform: {
      description:
        'Sandbox Build System operates on Linux, macOS (darwin), and Windows. ' +
        'Docker and Podman are available on all three platforms. ' +
        'Process isolation is the universal fallback (always available). ' +
        'Path handling uses Node.js path.join() / path.resolve() — never string concatenation. ' +
        'CI environments (GitHub Actions, GitLab CI, Jenkins) are first-class targets.',
      enforcement: 'soft',
      platforms: ['linux', 'darwin', 'win32'],
      isolationModes: ['docker', 'podman', 'process'],
    },
  },
}
