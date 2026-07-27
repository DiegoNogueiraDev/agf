/* eslint-disable security/detect-unsafe-regex */
/*!
 * Lint exemption: the regex patterns in this file are bounded
 * (literal alternations, short character classes, language-keyword
 * lookups) and run against parsed/structured input. The ReDoS class
 * the rule is designed to prevent is not reachable here.
 */
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-15.2 — Sensitive command/path patterns that demand human approval
 * before mcp-graph executes them. The list is conservative: it errs toward
 * "ask" rather than "auto-run". Each pattern carries a severity that the
 * UI/agent uses to decide how prominently to surface the prompt.
 */

export type ApprovalSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface BashApprovalPattern {
  /** Stable id for telemetry / suppression */
  id: string
  /** Regex tested against the raw command string */
  re: RegExp
  severity: ApprovalSeverity
  reason: string
}

export interface PathApprovalPattern {
  id: string
  re: RegExp
  severity: ApprovalSeverity
  reason: string
}

/**
 * Bash command patterns. Order matters only for `reason` selection — first
 * match wins, but every matching pattern contributes to the severity (max
 * severity across all matches is reported).
 */
export const BASH_PATTERNS: ReadonlyArray<BashApprovalPattern> = [
  {
    id: 'rm-rf-root',
    re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(\/|--no-preserve-root)/,
    severity: 'critical',
    reason: 'rm -rf at filesystem root',
  },
  { id: 'write-etc', re: /[>]\s*\/etc(\/|\b)/, severity: 'critical', reason: 'redirect into /etc' },
  { id: 'rm-rf', re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b/, severity: 'high', reason: 'recursive force-delete' },
  { id: 'npm-publish', re: /\bnpm\s+publish\b/, severity: 'high', reason: 'npm publish (irreversible release)' },
  {
    id: 'git-push-force',
    re: /\bgit\s+push\s+(--force\b|-f\b|--force-with-lease\b)/,
    severity: 'high',
    reason: 'git force-push (rewrites remote history)',
  },
  { id: 'chmod-777', re: /\bchmod\s+(-R\s+)?[0-7]*7{2,3}\b/, severity: 'medium', reason: 'chmod world-writable' },
  {
    id: 'curl-pipe-shell',
    re: /\bcurl\s+[^|]*\|\s*(sh|bash|zsh)\b/,
    severity: 'high',
    reason: 'curl piped into shell (RCE risk)',
  },
  { id: 'dd-of-disk', re: /\bdd\s+[^|]*of=\/dev\/[a-z]+\b/, severity: 'critical', reason: 'dd write to raw device' },
]

/**
 * Path patterns matched against file_path arguments of file-mutation tools
 * (Write, Edit, mkdir, etc).
 */
export const PATH_PATTERNS: ReadonlyArray<PathApprovalPattern> = [
  { id: 'etc-write', re: /(^|\/)etc(\/|$)/, severity: 'critical', reason: 'write under /etc' },
  { id: 'dotenv', re: /(^|\/)\.env(\.|$)/, severity: 'high', reason: 'writes to a .env secrets file' },
  { id: 'pem', re: /\.pem$/, severity: 'high', reason: 'writes to a *.pem private key' },
  {
    id: 'ssh-private',
    re: /(^|\/)\.ssh\/(id_[a-z0-9]+|.*_rsa|.*_ed25519)$/,
    severity: 'critical',
    reason: 'writes to ~/.ssh private key',
  },
  {
    id: 'node-modules',
    re: /(^|\/)node_modules(\/|$)/,
    severity: 'medium',
    reason: 'writes inside node_modules (managed by package manager)',
  },
]

const SEVERITY_RANK: Record<ApprovalSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

/** maxSeverity —  */
export function maxSeverity(a: ApprovalSeverity, b: ApprovalSeverity): ApprovalSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b
}
