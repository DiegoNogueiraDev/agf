/*!
 * config-injection-audit — red-team scan of agent config files for prompt-injection.
 *
 * WHY: CLAUDE.md, settings.json, hooks, and MCP configs are processed by the
 * agent as trusted context. An adversary who can write these files can inject
 * instructions that override agent behavior. This module scans file content for
 * known injection patterns using the existing detectInjectionPatterns() surface.
 *
 * Pure function — no I/O. Caller supplies filename (for context) and raw content.
 * Extends src/core/security/prompt-injection.ts (reuse, not recreate).
 */

import { detectInjectionPatterns } from './prompt-injection.js'
import { INVISIBLE_CHARS_CLASS } from './input-sanitizer.js'

// Collapse invisible/zero-width chars to a space (not remove) so an adversary can't hide an
// injection phrase by placing zero-width chars BETWEEN words: "ignore<ZWSP>all" -> "ignore all"
// still matches the phrase patterns, whereas removal would fuse it into "ignoreall" and evade.
// Built from a fixed, bounded internal char-class constant — never user input.
const INVISIBLE_CHARS_REGEX = new RegExp(`[${INVISIBLE_CHARS_CLASS}]`, 'gu')

function normalizeInvisible(content: string): string {
  return content.replace(INVISIBLE_CHARS_REGEX, ' ')
}

export type FindingSeverity = 'info' | 'medium' | 'high' | 'critical'

export interface ConfigFinding {
  label: string
  severity: FindingSeverity
}

export interface ConfigAuditResult {
  /** True when no injection patterns were detected. */
  pass: boolean
  /** Filename audited — informational only. */
  filename: string
  findings: ConfigFinding[]
}

/** All detected injection patterns in config files are treated as high severity. */
const CONFIG_SEVERITY: FindingSeverity = 'high'

/**
 * Scan a config file's raw content for prompt-injection patterns.
 *
 * @param filename - Config file name/path (used for diagnostics only).
 * @param content  - Raw file content to scan.
 */
export function auditConfigFile(filename: string, content: string): ConfigAuditResult {
  const detection = detectInjectionPatterns(normalizeInvisible(content))
  const findings: ConfigFinding[] = detection.patternsFound.map((label) => ({
    label,
    severity: CONFIG_SEVERITY,
  }))
  return {
    pass: findings.length === 0,
    filename,
    findings,
  }
}
