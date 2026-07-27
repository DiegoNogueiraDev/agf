/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export { sanitizeText, detectExfiltration, sanitizeToolArgs } from './input-sanitizer.js'
export type { SanitizationReport, ExfiltrationReport, ToolArgsSanitizationResult } from './input-sanitizer.js'

// Phase 3 — MCP RCE hardening (OX Security disclosure)
export { safeArg, safeArgv, assertCdpMethod } from './stdio-sanitizer.js'
export {
  validateSource,
  type SourceViolation,
  type SourceValidationResult,
  type ValidateSourceOptions,
} from './ast-source-validator.js'
export {
  assertTrustedMcpServer,
  isPinnedNpmSpec,
  parseNpxCommand,
  type McpServerSpec,
  type AllowlistOptions,
} from './registry-allowlist.js'
export {
  wrapToolHandler,
  redactSecrets,
  type AuditEntry,
  type AuditSink,
  type RateLimitConfig,
  type WrapOptions,
  type ToolHandler,
} from './tool-invocation-audit.js'

// Shell safety classifier (task-shell-safety)
export { is_dangerous_command, is_safe_command, unwrap_bash_lc } from './shell-safety-classifier.js'

// Prompt Injection Defense (browser plugin integration)
export {
  detectInjectionPatterns,
  wrapPageContent,
  unwrapPageContent,
  sanitizePageContent,
  type DetectionResult,
  type SanitizeResult,
} from './prompt-injection.js'

// URL Security Rules + Destructive Actions
export { createUrlPolicy, type UrlPolicy, type UrlPolicyConfig } from './url-rules.js'
export {
  createDestructivePolicy,
  type DestructivePolicy,
  type DestructivePolicyMode,
  type DestructiveAction,
} from './destructive-actions.js'
