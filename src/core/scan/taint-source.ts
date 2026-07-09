/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * taint-source — wires the (previously dormant) heuristic taint analyzer into
 * `agf scan` as the 'taint' source. Composes with: code/taint-lite.ts
 * (analyzeTaint), scan-cmd.ts (source='taint'), scan-types.ts.
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { analyzeTaint } from '../code/taint-lite.js'
import type { ScanFinding } from './scan-types.js'

/** Below this confidence, findings are noise — drop them from the scan output. */
const MIN_CONFIDENCE = 0.5

/**
 * Scan a project's TypeScript source for heuristic source->sink taint flows.
 * Pure read-only; emits the shared ScanFinding shape.
 */
export function scanTaint(dir: string): ScanFinding[] {
  const files = globSync('src/**/*.ts', {
    cwd: dir,
    ignore: ['**/*.test.ts', '**/*.bench.ts', '**/node_modules/**'],
  })

  const findings: ScanFinding[] = []
  for (const file of files) {
    const content = readFileSync(`${dir}/${file}`, 'utf-8')
    for (const finding of analyzeTaint(content, file)) {
      if (finding.confidence < MIN_CONFIDENCE) continue
      findings.push({
        source: 'taint',
        file: finding.file,
        line: finding.sinkLine,
        severity: finding.confidence >= 0.7 ? 'warning' : 'info',
        message: `${finding.path} (confidence ${finding.confidence.toFixed(2)})`,
      })
    }
  }

  return findings
}
