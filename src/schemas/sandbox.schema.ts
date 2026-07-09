/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

/* ================================================================
   SANDBOX BUILD API — Zod Schemas (v1.0)

   Tool Definitions for Wave-12 Sandbox Build (Local CI/CD Isolation)
   - sandbox/build: Compile source in isolated environment
   - sandbox/report: Parse test results and integrate into graph
   - sandbox/check-env: Validate environment against CI config
   - sandbox/validate: Pre-flight validation of sandbox config
   ================================================================ */

// ── Stack & Isolation Types ──

export const StackTypeSchema = z
  .enum(['maven', 'gradle', 'npm', 'go', 'pip', 'auto'])
  .describe('Dependency/build stack auto-detection or override')

export const IsolationModeSchema = z
  .enum(['docker', 'podman', 'process', 'auto'])
  .describe('Isolation strategy: docker (preferred) → podman (rootless) → process (fallback)')

export const ExecutionProfileSchema = z
  .enum(['ci-mirror', 'fast', 'full'])
  .describe(
    'ci-mirror: CI-parity with cached artifacts; fast: process isolation, hot cache; full: clean cache, deep validation',
  )

export const TestFormatSchema = z
  .enum(['surefire', 'jest', 'junit', 'go-test', 'auto'])
  .describe('Test result format: surefire/junit (Maven), jest (JS), go-test (Go), auto for detection')

// ── Credentials (never persisted) ──

export const CredentialsSchema = z
  .record(z.string(), z.string())
  .describe("Map of secret names → values (e.g., { 'NPM_TOKEN': '...', 'MAVEN_GPG_PASSPHRASE': '...' })")
  .optional()

// ── Input: sandbox/build ──

export const SandboxBuildInputSchema = z
  .object({
    projectDir: z.string().describe('Project root directory (absolute or relative to cwd)'),
    stack: StackTypeSchema.optional().default('auto').describe('Override auto-detection'),
    isolation: IsolationModeSchema.optional().default('auto').describe('Override isolation strategy'),
    profile: ExecutionProfileSchema.optional().default('fast').describe('Execution profile'),
    command: z.string().optional().describe('Custom build command; if omitted, auto-detected from stack'),
    image: z.string().optional().describe('Custom Docker/Podman image URI (overrides CI-parity image)'),
    timeout: z.number().min(1000).max(3600000).optional().default(300000).describe('Timeout in milliseconds'),
    parallel: z.boolean().optional().default(false).describe('Enable parallel execution (Maven: -T)'),
    testFilter: z.string().optional().describe('Test pattern filter (Maven: -Dtest=..., Jest: --testNamePattern)'),
    credentials: CredentialsSchema.describe('Credentials for private repositories (not persisted)'),
  })
  .describe('Input contract for sandbox/build action')

export type SandboxBuildInput = z.infer<typeof SandboxBuildInputSchema>

// ── Output: sandbox/build (BuildResult) ──

export const BuildResultSchema = z
  .object({
    success: z.boolean().describe('Whether build/test succeeded'),
    status: z
      .enum(['success', 'failure', 'timeout', 'error'])
      .describe('Detailed status (success, failure, timeout, or error)'),
    executionMode: z
      .enum(['docker', 'podman', 'process'])
      .describe('Actual isolation mode used (resolved from fallback chain)'),
    profile: ExecutionProfileSchema.describe('Profile that was executed'),
    command: z.string().describe('Exact command that was executed'),
    stack: StackTypeSchema.describe('Stack that was detected/used'),
    durationMs: z.number().describe('Total execution time in milliseconds'),
    exitCode: z.number().optional().describe('Process exit code (if applicable)'),
    output: z.string().describe('stdout from build execution'),
    stderr: z.string().optional().describe('stderr from build execution'),
    timestamp: z.string().datetime().describe('ISO 8601 timestamp of execution'),
    isolatedDir: z.string().describe('Path to isolated working directory'),
    cacheKey: z.string().describe('SHA-256 fingerprint of inputs for cache lookup'),
    cacheHit: z.boolean().describe('Whether result was retrieved from cache'),
    fallbackChain: z
      .array(z.enum(['docker', 'podman', 'process']))
      .optional()
      .describe('Sequence of fallback attempts (e.g., [docker, podman, process])'),
    warnings: z.array(z.string()).optional().describe('Non-fatal warnings during execution'),
    evidenceFiles: z.array(z.string()).optional().describe('Paths to artifacts (logs, reports, jars, etc.)'),
  })
  .describe('Output contract for sandbox/build action')

export type BuildResult = z.infer<typeof BuildResultSchema>

// ── Input: sandbox/report ──

export const ReportIntegrationInputSchema = z
  .object({
    testOutput: z.string().describe('Raw test result output (file path or content)'),
    testFormat: TestFormatSchema.optional().default('auto').describe('Test result format'),
    nodeId: z.string().optional().describe('Graph node ID to update with test results'),
    updateGraph: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, update node status (blocked on failure, success on pass)'),
    buildResult: BuildResultSchema.optional().describe('Structured build result (from sandbox/build)'),
  })
  .describe('Input contract for sandbox/report action')

export type ReportIntegrationInput = z.infer<typeof ReportIntegrationInputSchema>

// ── Test Result Parsing ──

export const TestSummarySchema = z
  .object({
    totalTests: z.number().min(0).describe('Total number of tests executed'),
    passedTests: z.number().min(0).describe('Number of tests that passed'),
    failedTests: z.number().min(0).describe('Number of tests that failed'),
    skippedTests: z.number().min(0).describe('Number of tests that were skipped'),
    durationMs: z.number().min(0).optional().describe('Total test execution time'),
  })
  .describe('Aggregated test metrics')

export type TestSummary = z.infer<typeof TestSummarySchema>

export const FailedTestEntrySchema = z
  .object({
    name: z.string().describe('Test class or file name'),
    testMethod: z.string().describe('Test method name'),
    message: z.string().describe('Failure reason or assertion message'),
    stackTrace: z.string().optional().describe('Full stack trace (truncated for brevity)'),
  })
  .describe('Individual failed test entry')

export type FailedTestEntry = z.infer<typeof FailedTestEntrySchema>

export const TestParseResultSchema = z
  .object({
    success: z.boolean().describe('Whether tests passed overall'),
    format: TestFormatSchema.describe('Detected/used format'),
    summary: TestSummarySchema.describe('Aggregated test metrics'),
    failedTests: z.array(FailedTestEntrySchema).optional().describe('List of failures (if any)'),
    errorMessage: z.string().optional().describe('Parser error message (if parsing failed)'),
    timestamp: z.string().datetime().describe('ISO 8601 timestamp of parse'),
  })
  .describe('Deterministic test result after parsing')

export type TestParseResult = z.infer<typeof TestParseResultSchema>

// ── Output: sandbox/report (ReportIntegrationResult) ──

export const ReportIntegrationResultSchema = z
  .object({
    success: z.boolean().describe('Whether report integration succeeded'),
    parsedTests: TestParseResultSchema.describe('Parsed test metrics'),
    graphUpdateStatus: z
      .enum(['updated', 'skipped', 'failed'])
      .optional()
      .describe('Result of optional graph node update'),
    nodeStatus: z
      .enum(['blocked', 'done', 'in_progress'])
      .optional()
      .describe('Updated node status (blocked=failure, done=success)'),
    rationale: z.string().optional().describe('Update rationale stored in graph'),
    warnings: z.array(z.string()).optional().describe('Non-fatal warnings'),
    timestamp: z.string().datetime().describe('ISO 8601 timestamp'),
  })
  .describe('Output contract for sandbox/report action')

export type ReportIntegrationResult = z.infer<typeof ReportIntegrationResultSchema>

// ── Input: sandbox/check-env ──

export const EnvRequirementsSchema = z
  .object({
    ciConfigPath: z
      .string()
      .optional()
      .describe('Path to CI config file (.github/workflows/*.yml, .gitlab-ci.yml, etc.)'),
    requiredVars: z.array(z.string()).optional().describe('Explicit list of required environment variables'),
    expectedVersions: z
      .record(z.string(), z.string())
      .optional()
      .describe("Expected versions (e.g., { 'NODE_VERSION': '18.0.0', 'MAVEN_VERSION': '3.9.0' })"),
  })
  .describe('Input contract for sandbox/check-env action')

export type EnvRequirements = z.infer<typeof EnvRequirementsSchema>

export const VersionDivergenceSchema = z
  .object({
    variable: z.string().describe('Environment variable name'),
    expectedVersion: z.string().describe('Expected version from CI config'),
    actualVersion: z.string().describe('Actual version in local environment'),
  })
  .describe('Single version divergence entry')

export type VersionDivergence = z.infer<typeof VersionDivergenceSchema>

// ── Output: sandbox/check-env (EnvCheckResult) ──

export const EnvCheckResultSchema = z
  .object({
    success: z.boolean().describe('Whether all required vars and versions match'),
    missingEnvVars: z.array(z.string()).describe('Required variables not present in local env'),
    divergences: z.array(VersionDivergenceSchema).describe('Version mismatches'),
    recommendations: z.array(z.string()).describe('Remediation steps for missing/divergent vars'),
    timestamp: z.string().datetime().describe('ISO 8601 timestamp'),
    summary: z.object({
      passed: z.boolean().describe('Overall pass/fail'),
      issues: z.number().describe('Total count of missing + divergent items'),
    }),
  })
  .describe('Output contract for sandbox/check-env action')

export type EnvCheckResult = z.infer<typeof EnvCheckResultSchema>

// ── Input: sandbox/validate ──

export const SandboxConfigValidationSchema = z
  .object({
    config: z
      .object({
        projectDir: z.string(),
        stack: StackTypeSchema.optional(),
        isolation: IsolationModeSchema.optional(),
        profile: ExecutionProfileSchema.optional(),
      })
      .describe('Sandbox configuration to validate'),
    validateStrictly: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, check tool availability and permissions; if false, only syntax'),
  })
  .describe('Input contract for sandbox/validate action')

export type SandboxConfigValidation = z.infer<typeof SandboxConfigValidationSchema>

// ── Output: sandbox/validate (ValidationResult) ──

export const ValidationIssueSchema = z
  .object({
    level: z.enum(['error', 'warning', 'info']).describe('Severity level'),
    field: z.string().describe('Config field with issue'),
    message: z.string().describe('Explanation of issue'),
    suggestion: z.string().optional().describe('Suggested fix'),
  })
  .describe('Single validation issue')

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>

export const ValidationResultSchema = z
  .object({
    valid: z.boolean().describe('Whether config is valid'),
    issues: z.array(ValidationIssueSchema).describe('List of issues found'),
    warnings: z.array(z.string()).optional().describe('Non-critical warnings'),
    toolAvailability: z
      .object({
        docker: z.boolean().describe('Docker available on this system'),
        podman: z.boolean().describe('Podman available on this system'),
        process: z.boolean().describe('Process isolation available (always true)'),
      })
      .optional()
      .describe('Tool availability if strict validation enabled'),
    recommendedIsolation: IsolationModeSchema.optional().describe(
      'Recommended isolation mode based on available tools',
    ),
    timestamp: z.string().datetime().describe('ISO 8601 timestamp'),
  })
  .describe('Output contract for sandbox/validate action')

export type ValidationResult = z.infer<typeof ValidationResultSchema>

// ── MCP Tool Input/Output Definitions ──

const SandboxBuildActionSchema = z.object({
  action: z.literal('build'),
  ...SandboxBuildInputSchema.shape,
})

const SandboxReportActionSchema = z.object({
  action: z.literal('report'),
  ...ReportIntegrationInputSchema.shape,
})

const SandboxCheckEnvActionSchema = z.object({
  action: z.literal('check-env'),
  ...EnvRequirementsSchema.shape,
})

const SandboxValidateActionSchema = z.object({
  action: z.literal('validate'),
  ...SandboxConfigValidationSchema.shape,
})

export const SandboxToolInputSchema = z.union([
  SandboxBuildActionSchema,
  SandboxReportActionSchema,
  SandboxCheckEnvActionSchema,
  SandboxValidateActionSchema,
])

export type SandboxToolInput = z.infer<typeof SandboxToolInputSchema>

export const SandboxToolOutputSchema = z.union([
  BuildResultSchema,
  ReportIntegrationResultSchema,
  EnvCheckResultSchema,
  ValidationResultSchema,
])

export type SandboxToolOutput = z.infer<typeof SandboxToolOutputSchema>
