/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { getBuiltInRules, compileRulesFromMarkdown, validateImports, validateFiles } from './contract-engine.js'
export type {
  ArchitectureRule,
  ContractViolation,
  RuleType,
  ValidateResult,
  ValidateOptions,
} from './contract-engine.js'
export { generateMinimal, generateEdgeCase } from './synthetic-data-gen.js'
export { identifyQuickWins, generateMicroPRPlan } from './self-healing-planner.js'
export type { QuickWin, MicroPRPlan, DimensionScore } from './self-healing-planner.js'
export { runTests } from './test-runner.js'
export type { TestRunResult, TestRunOptions, TestError } from './test-runner.js'
export { runTestGate } from './test-gate.js'
export type { TestGateResult, TestGateMode } from './test-gate.js'
export { registerAgentRole, getAgentRole } from './agent-role.js'
export type { AgentRole, AgentRoleRegistration, StoredAgentRole } from './agent-role.js'
export { scanContextDensity } from './context-density-scanner.js'
export type { ContextDensityResult, ContextDensityOptions } from './context-density-scanner.js'
export { saveHarnessMemory, getHarnessMemory } from './cross-session-memory.js'
export type { HarnessMemoryState } from './cross-session-memory.js'
export { scanDocsCoverage } from './docs-coverage-scanner.js'
export type { DocsCoverageInput, DocsCoverageResult } from './docs-coverage-scanner.js'
export { scanErrorHandling } from './error-handling-scanner.js'
export type { ErrorHandlingResult, ErrorHandlingOptions } from './error-handling-scanner.js'
export { checkDependencyDirection, checkCircularDependencies, checkBarrelIntegrity } from './fitness-functions.js'
export type { Violation, FitnessCheckResult, FileContent, DirectoryInfo } from './fitness-functions.js'
export { runHarnessScanCached, resetHarnessCache } from './harness-cache.js'
export { getEvolutionReport } from './harness-evolution.js'
export type { EvolutionReport } from './harness-evolution.js'
export {
  getHarnessPreflightWarning,
  getHarnessRegressionReport,
  checkHarnessRegressionGate,
} from './harness-preflight.js'
export type { HarnessPreflightWarning, HarnessRegressionReport, HarnessGateResult } from './harness-preflight.js'
export { runHarnessScan } from './harness-scan-runner.js'
export type { HarnessScanResult, HarnessScanOptions } from './harness-scan-runner.js'
export { getTrends, predictGradeTarget } from './harness-trends.js'
export type { TrendResult, GradePrediction } from './harness-trends.js'
export { computeHarnessabilityScore } from './harnessability-score.js'
export type { HarnessabilityInput, DimensionBreakdown, HarnessabilityResult } from './harnessability-score.js'
export { IssuePatternTracker } from './issue-pattern-tracker.js'
export type { IssuePattern, PatternStats, RuleSuggestion } from './issue-pattern-tracker.js'
export { scanNamingClarity } from './naming-clarity-scanner.js'
export type { NamingClarityResult, NamingClarityOptions } from './naming-clarity-scanner.js'
export { calculateParetoPriority } from './pareto-priority.js'
export type { DimensionGap, PrioritizedDimension } from './pareto-priority.js'
export { evaluate } from './remediation-engine.js'
export { listRules, findRule, resolveTemplate } from './remediation-rules.js'
export type { RemediationRule } from './remediation-rules.js'
export { SuppressionStore } from './remediation-suppression.js'
export type { SuppressionRecord } from './remediation-suppression.js'
export { RemediationValidator } from './remediation-validator.js'
export type { PostFixResult } from './remediation-validator.js'
export { fuseSensors } from './sensor-fusion.js'
export type { DimensionScores, SensorCluster } from './sensor-fusion.js'
export { scanTestCoverage } from './test-coverage-scanner.js'
export type { TestCoverageResult, TestFileInfo, TestCoverageOptions } from './test-coverage-scanner.js'
export { scanTypeCoverage } from './type-coverage-scanner.js'
export type { TypeCoverageResult, TypeCoverageOptions } from './type-coverage-scanner.js'
export type {
  HarnessDimension,
  RemediationCategory,
  ViolationDetail,
  RemediationSuggestion,
  ValidationResult,
} from './violation-detail.js'
export { checkInvariants, getBuiltInInvariants } from './property-invariants.js'
export type { PropertyInvariant, InvariantViolation, InvariantResult } from './property-invariants.js'
export { discoverTestFiles } from './test-discovery.js'
export { runSyntheticValidation } from './synthetic-validation-gate.js'
export type { SyntheticValidationResult, MutationRecord } from './synthetic-validation-gate.js'
