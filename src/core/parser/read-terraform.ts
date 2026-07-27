/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §Task 3.5 subtask -- Terraform HCL parser: extracts resource, provider, variable, data, output.
 * Deterministic — pure regex over raw text, zero LLM calls.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'read-terraform.ts' })

export type TerraformKind = 'resource' | 'provider' | 'variable' | 'data' | 'output' | 'module' | 'terraform' | 'locals'

export interface TerraformEntry {
  kind: TerraformKind
  type: string
  name: string
}

export interface ParsedTerraform {
  entries: TerraformEntry[]
  raw: string
}

const TWO_LABEL = /^(resource|data)\s+"(\w+)"\s+"(\w+)"/
const ONE_LABEL = /^(provider|variable|output|module)\s+"(\w+)"/
const NO_LABEL = /^(terraform|locals)\s*\{/

/** Parse Terraform HCL and extract top-level block definitions (best-effort). */
export function parseTerraform(content: string): ParsedTerraform {
  if (!content.trim()) return { entries: [], raw: content }

  const entries: TerraformEntry[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    let m = TWO_LABEL.exec(line)
    if (m) {
      entries.push({ kind: m[1] as TerraformKind, type: m[2]!, name: m[3]! })
      continue
    }

    m = ONE_LABEL.exec(line)
    if (m) {
      entries.push({ kind: m[1] as TerraformKind, type: '', name: m[2]! })
      continue
    }

    m = NO_LABEL.exec(line)
    if (m) {
      entries.push({ kind: m[1] as TerraformKind, type: '', name: '' })
    }
  }

  log.debug('read-terraform:parsed', { entriesCount: entries.length })
  return { entries, raw: content }
}
