/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * security-source — wires the (previously dormant) config-injection audit into
 * `agf scan` as the `security` source. Agent config files (CLAUDE.md, AGENTS.md,
 * settings.json, MCP) ARE prompt context an agent ingests — a prompt-injection
 * vector. This surfaces that guard as an on-demand audit (no runtime enforcement,
 * zero risk of blocking legit work). Pure read-only; emits the shared ScanFinding
 * shape. Composes with: security/config-injection-audit.ts, scan-types.ts.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { auditConfigFile, type FindingSeverity } from '../security/config-injection-audit.js'
import type { ScanFinding, ScanSeverity } from './scan-types.js'

/** Agent-ingested config files that are a prompt-injection surface. */
const CONFIG_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
]

function toScanSeverity(severity: FindingSeverity): ScanSeverity {
  if (severity === 'critical' || severity === 'high') return 'error'
  if (severity === 'medium') return 'warning'
  return 'info'
}

/** Audit agent config files for prompt-injection patterns → ScanFinding[]. */
export function scanConfigSecurity(dir: string): ScanFinding[] {
  const findings: ScanFinding[] = []
  for (const rel of CONFIG_FILES) {
    const path = join(dir, rel)
    if (!existsSync(path)) continue
    let content: string
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    for (const f of auditConfigFile(rel, content).findings) {
      findings.push({
        source: 'security',
        file: rel,
        line: 0,
        severity: toScanSeverity(f.severity),
        message: `prompt-injection pattern: ${f.label}`,
      })
    }
  }
  return findings
}
